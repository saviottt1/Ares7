import * as THREE from 'three'
import { CONFIG } from '../game/config'
import type { Allocation } from '../sim/engine'

export type StationKey = 'shield' | 'bio' | 'hab'
export const STATIONS: Record<StationKey, { title: string; position: THREE.Vector3 }> = {
  shield: { title: 'Shield & Comms Relay', position: new THREE.Vector3(0, 0, -4.2) },
  bio: { title: 'CSA Bio-Dome', position: new THREE.Vector3(-4.2, 0, 2.2) },
  hab: { title: 'Habitat & ECLSS', position: new THREE.Vector3(4.2, 0, 2.2) },
}

const COLOR = {
  slate: '#0f172a',
  deepBlue: '#1e293b',
  pale: '#f8fafc',
  orange: '#ea580c',
  rust: '#9a3412',
  gold: '#eab308',
  green: '#10b981',
  red: '#ef4444',
  solarBlue: '#1e3a8a',
  sand: '#c87950',
}

const flat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...extra })

/**
 * Procedural-only isometric Mars outpost.
 * Pure presentation class: simulation logic remains decoupled in sim/engine.ts.
 */
export class OutpostScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-9, 9, 9, -9, 0.1, 80)
  private astronaut = new THREE.Group()
  private astronautBody = new THREE.Group()
  private radiator = new THREE.Group()
  private stationRoots: Record<StationKey, THREE.Group> = {} as Record<StationKey, THREE.Group>
  private rings: Record<StationKey, THREE.Mesh> = {} as Record<StationKey, THREE.Mesh>
  private picks: THREE.Mesh[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private target: { x: number; z: number; station?: StationKey } | null = null
  private lastSelected: StationKey = 'shield'
  private allocation: Allocation = { shield: 30, bio: 40, hab: 40 }
  private onSelect: (key: StationKey) => void
  private onAdjust: (key: StationKey, delta: -5 | 5) => void
  private canvas: HTMLCanvasElement

  // 3D Enhancements
  private dustPoints?: THREE.Points
  private dustPositions?: Float32Array
  private beaconMesh?: THREE.Mesh
  private batteryLeds: THREE.Mesh[] = []
  private walkTime = 0
  private isMoving = false
  private animTime = 0

  constructor(
    canvas: HTMLCanvasElement,
    onSelect: (key: StationKey) => void,
    onAdjust: (key: StationKey, delta: -5 | 5) => void
  ) {
    this.canvas = canvas
    this.onSelect = onSelect
    this.onAdjust = onAdjust
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setClearColor('#943b1a', 1)
    this.renderer.shadowMap.enabled = false
    this.camera.position.set(9, 9, 9)
    this.camera.lookAt(0, 0, 0)
    this.build()
    this.resize()
    window.addEventListener('resize', this.resize)
    canvas.addEventListener('click', this.onCanvasClick)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.canvas.removeEventListener('click', this.onCanvasClick)
    this.renderer.dispose()
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material.dispose())
      }
    })
  }

  setState(allocation: Allocation, food: number, selected?: StationKey, battery = 30, dust = false): void {
    this.allocation = { ...allocation }
    if (selected) this.lastSelected = selected

    // Shield dome power opacity
    const dome = this.stationRoots.shield?.userData.dome as THREE.Mesh | undefined
    if (dome) {
      ;(dome.material as THREE.MeshStandardMaterial).opacity = 0.15 + 0.6 * Math.min(1, allocation.shield / 60)
    }

    // Bio-Dome crop trays
    const trays = this.stationRoots.bio?.userData.trays as THREE.Mesh[] | undefined
    if (trays) {
      for (const tray of trays) {
        const material = tray.material as THREE.MeshStandardMaterial
        material.color.set(food < 55 ? '#8b5e34' : COLOR.green)
        material.emissive.set(food < 55 ? '#000000' : COLOR.green)
        material.emissiveIntensity = Math.min(0.4, allocation.bio / 160)
      }
    }

    // Habitat windows lit based on hab power
    const windows = this.stationRoots.hab?.userData.windows as THREE.Mesh[] | undefined
    if (windows) {
      const lit = Math.round((6 * allocation.hab) / 60)
      windows.forEach((windowMesh, i) =>
        (windowMesh.material as THREE.MeshStandardMaterial).color.set(i < lit ? COLOR.gold : '#44403c')
      )
    }

    // Battery LED state
    this.batteryLeds.forEach((led, i) => {
      const mat = led.material as THREE.MeshStandardMaterial
      if (battery >= (i + 1) * 7.5) {
        mat.color.set(COLOR.green)
        mat.emissive.set(COLOR.green)
        mat.emissiveIntensity = 0.6
      } else if (battery >= i * 7.5) {
        mat.color.set(COLOR.gold)
        mat.emissive.set(COLOR.gold)
        mat.emissiveIntensity = 0.4
      } else {
        mat.color.set('#334155')
        mat.emissive.set('#000000')
        mat.emissiveIntensity = 0
      }
    })

    // Atmospheric dust adjustment
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = dust ? 12 : 24
      this.scene.fog.far = dust ? 36 : 50
    }

    this.refreshRings()
  }

  /** Clamp elapsed time, keep astronaut on the pad and out of station colliders. */
  step(delta: number, keys: ReadonlySet<string>): void {
    const dt = Math.min(0.05, Math.max(0, delta))
    this.animTime += dt

    let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)

    if (x !== 0 || z !== 0) {
      this.target = null
    } else if (this.target) {
      const dx = this.target.x - this.astronaut.position.x
      const dz = this.target.z - this.astronaut.position.z
      const distance = Math.hypot(dx, dz)
      const stopDistance = this.target.station ? 1.7 : 0.12
      if (distance <= stopDistance) {
        this.target = null
      } else {
        x = dx / distance
        z = dz / distance
      }
    }

    const length = Math.hypot(x, z)
    this.isMoving = length > 0

    if (this.isMoving) {
      x /= length
      z /= length
      const speed = CONFIG.outpost.walkSpeed
      const nx = this.astronaut.position.x + x * speed * dt
      const nz = this.astronaut.position.z + z * speed * dt

      // Pad boundary clamp (radius 7) & circle collision with stations (radius 1.4)
      if (
        Math.hypot(nx, nz) <= 7 &&
        !Object.values(STATIONS).some(st => Math.hypot(nx - st.position.x, nz - st.position.z) < 1.4)
      ) {
        this.astronaut.position.x = nx
        this.astronaut.position.z = nz
        this.astronaut.rotation.y = Math.atan2(x, z)
      } else if (this.target) {
        this.target = null
      }

      this.walkTime += dt * 10
      this.astronautBody.position.y = Math.sin(this.walkTime) * 0.05
    } else {
      this.astronautBody.position.y = 0
    }

    // Radiator rotation on Habitat scales with hab allocation
    this.radiator.rotation.y += dt * (this.allocation.hab / 60) * 0.7

    // Animate beacon atop shield station antenna
    if (this.beaconMesh) {
      const beaconMat = this.beaconMesh.material as THREE.MeshStandardMaterial
      const pulse = Math.sin(this.animTime * 4) * 0.5 + 0.5
      beaconMat.emissiveIntensity = 0.3 + pulse * 0.7
    }

    // Animate atmospheric dust particles
    if (this.dustPoints && this.dustPositions) {
      for (let i = 0; i < 150; i++) {
        let px = this.dustPositions[i * 3]
        let py = this.dustPositions[i * 3 + 1]
        let pz = this.dustPositions[i * 3 + 2]

        px += Math.cos(this.animTime * 0.3 + i) * dt * 0.8
        pz += Math.sin(this.animTime * 0.2 + i) * dt * 0.8
        py += Math.sin(this.animTime * 0.5 + i) * dt * 0.2

        if (px > 12) px = -12
        if (px < -12) px = 12
        if (pz > 12) pz = -12
        if (pz < -12) pz = 12
        if (py < 0.2) py = 4.5
        if (py > 5.0) py = 0.5

        this.dustPositions[i * 3] = px
        this.dustPositions[i * 3 + 1] = py
        this.dustPositions[i * 3 + 2] = pz
      }
      this.dustPoints.geometry.attributes.position.needsUpdate = true
    }

    this.refreshRings()
  }

  adjust(delta: -5 | 5): void {
    const position = this.astronaut.position
    const nearby = (Object.keys(STATIONS) as StationKey[]).find(
      key => position.distanceTo(STATIONS[key].position) <= 2.2
    )
    const key = nearby ?? this.lastSelected
    this.lastSelected = key
    this.onSelect(key)
    this.onAdjust(key, delta)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  private resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const span = CONFIG.outpost.cameraSpan
    this.camera.left = (-span * width) / height
    this.camera.right = (span * width) / height
    this.camera.top = span
    this.camera.bottom = -span
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private onCanvasClick = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.picks, false)[0]
    const key = hit?.object.userData.station as StationKey | undefined
    if (key) {
      this.lastSelected = key
      this.target = { x: STATIONS[key].position.x, z: STATIONS[key].position.z, station: key }
      this.onSelect(key)
    } else if (hit) {
      const point = hit.point
      const radius = Math.hypot(point.x, point.z)
      const scale = radius > 6.6 ? 6.6 / radius : 1
      this.target = { x: point.x * scale, z: point.z * scale }
    }
  }

  private build(): void {
    this.scene.background = new THREE.Color('#943b1a')
    this.scene.fog = new THREE.Fog('#943b1a', 24, 50)
    this.scene.add(new THREE.HemisphereLight('#fed7aa', '#7c2d12', 1.8))
    const sun = new THREE.DirectionalLight('#fff4df', 2.4)
    sun.position.set(-7, 12, 5)
    this.scene.add(sun)

    // Terrain with procedural elevation
    const terrainGeometry = new THREE.PlaneGeometry(36, 36, 24, 24)
    const pos = terrainGeometry.attributes.position
    let seed = 317
    for (let i = 0; i < pos.count; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      pos.setZ(i, (seed / 4294967296) * 0.6)
    }
    terrainGeometry.computeVertexNormals()
    const terrain = new THREE.Mesh(terrainGeometry, flat('#85341a'))
    terrain.rotation.x = -Math.PI / 2
    terrain.position.y = -0.32
    this.scene.add(terrain)

    // Martian Outpost Pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.4, 0.22, 40), flat('#a8522a'))
    pad.position.y = -0.1
    this.scene.add(pad)

    // Ground raycast plane
    const groundPick = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    )
    groundPick.rotation.x = -Math.PI / 2
    groundPick.position.y = 0.03
    this.picks.push(groundPick)
    this.scene.add(groundPick)

    // Pad boundary ring
    const edge = new THREE.Mesh(new THREE.TorusGeometry(7, 0.05, 6, 72), flat(COLOR.gold))
    edge.rotation.x = Math.PI / 2
    edge.position.y = 0.03
    this.scene.add(edge)

    // Surrounding Mars rock clusters
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0)
    const rocks = new THREE.InstancedMesh(rockGeo, flat('#652312'), 32)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 32; i += 1) {
      const angle = i * 2.1
      const radius = 8.1 + (i % 6) * 0.52
      dummy.position.set(Math.cos(angle) * radius, -0.04, Math.sin(angle) * radius)
      dummy.scale.set(0.7 + (i % 3) * 0.35, 0.4 + (i % 4) * 0.2, 0.7 + (i % 2) * 0.35)
      dummy.rotation.set(i * 0.07, i * 0.8, i * 0.13)
      dummy.updateMatrix()
      rocks.setMatrixAt(i, dummy.matrix)
    }
    this.scene.add(rocks)

    // Distant mountain ridges
    for (let m = 0; m < 5; m++) {
      const ridge = new THREE.Mesh(
        new THREE.ConeGeometry(3.5 + m * 0.5, 2.5 + (m % 3) * 0.8, 5),
        flat('#6d2714')
      )
      const mAngle = (m / 5) * Math.PI * 2 + 0.3
      ridge.position.set(Math.cos(mAngle) * 16, 0.8, Math.sin(mAngle) * 16)
      this.scene.add(ridge)
    }

    this.addShieldStation()
    this.addBioStation()
    this.addHabStation()
    this.addSolarArray()
    this.addBatteryHub()
    this.addAtmosphericDust()
    this.addAstronaut()
  }

  private addShieldStation(): void {
    const key: StationKey = 'shield'
    const group = this.stationGroup(key)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.25, 8), flat(COLOR.slate))
    base.position.y = 0.12
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      flat(COLOR.pale, { wireframe: true, transparent: true, opacity: 0.45 })
    )
    dome.position.y = 0.25
    group.add(base, dome)
    group.userData.dome = dome
    this.addAntenna(group)
  }

  private addBioStation(): void {
    const key: StationKey = 'bio'
    const group = this.stationGroup(key)
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
      flat('#e9d5b3', { transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    )
    shell.position.y = 0.22
    const trays: THREE.Mesh[] = []
    for (let i = 0; i < 4; i += 1) {
      const tray = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.12, 0.32),
        flat(COLOR.green, { emissive: COLOR.green, emissiveIntensity: 0.12 })
      )
      tray.position.set((i % 2) * 0.8 - 0.4, 0.2 + Math.floor(i / 2) * 0.16, -0.2 + Math.floor(i / 2) * 0.58)
      group.add(tray)
      trays.push(tray)
    }
    group.add(shell)
    group.userData.trays = trays
  }

  private addHabStation(): void {
    const key: StationKey = 'hab'
    const group = this.stationGroup(key)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.05, 1.65, 10), flat('#f1e8d2'))
    body.position.y = 0.82
    group.add(body)
    const windows: THREE.Mesh[] = []
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2
      const windowMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.25, 0.08),
        flat('#44403c', { emissive: COLOR.gold, emissiveIntensity: 0.28 })
      )
      windowMesh.position.set(Math.sin(angle) * 0.82, 0.9, Math.cos(angle) * 0.82)
      windowMesh.lookAt(windowMesh.position.clone().multiplyScalar(2))
      group.add(windowMesh)
      windows.push(windowMesh)
    }
    const solar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), flat('#334155'))
    solar.position.set(1.45, 1.05, 0)
    group.add(solar)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), flat(COLOR.slate))
    arm.rotation.z = Math.PI / 2
    arm.position.set(1.05, 1.05, 0)
    this.radiator.add(arm, solar)
    group.add(this.radiator)
    group.userData.windows = windows
  }

  private addSolarArray(): void {
    const group = new THREE.Group()
    group.position.set(-2.5, 0, -3.2)
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.65), flat(COLOR.solarBlue, { roughness: 0.4 }))
      panel.position.set(i * 0.8 - 0.8, 0.45, 0)
      panel.rotation.x = -Math.PI / 6
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 4), flat('#475569'))
      stand.position.set(i * 0.8 - 0.8, 0.22, 0)
      group.add(panel, stand)
    }
    this.scene.add(group)
  }

  private addBatteryHub(): void {
    const group = new THREE.Group()
    group.position.set(2.4, 0, -3.0)
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), flat('#1e293b'))
    box.position.y = 0.28
    group.add(box)

    // 4 LED indicators for battery charge status
    this.batteryLeds = []
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 4),
        flat(COLOR.green, { emissive: COLOR.green, emissiveIntensity: 0.5 })
      )
      led.position.set(i * 0.18 - 0.27, 0.48, 0.31)
      group.add(led)
      this.batteryLeds.push(led)
    }
    this.scene.add(group)
  }

  private addAtmosphericDust(): void {
    const count = 150
    const geometry = new THREE.BufferGeometry()
    this.dustPositions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      this.dustPositions[i * 3] = (Math.random() - 0.5) * 20
      this.dustPositions[i * 3 + 1] = Math.random() * 4.5 + 0.5
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3))
    const material = new THREE.PointsMaterial({
      color: '#e07a4a',
      size: 0.12,
      transparent: true,
      opacity: 0.65,
    })
    this.dustPoints = new THREE.Points(geometry, material)
    this.scene.add(this.dustPoints)
  }

  private stationGroup(key: StationKey): THREE.Group {
    const group = new THREE.Group()
    group.position.copy(STATIONS[key].position)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.035, 5, 48),
      flat(COLOR.pale, { transparent: true, opacity: 0.34 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.04
    group.add(ring)
    this.scene.add(group)
    this.stationRoots[key] = group
    this.rings[key] = ring
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    )
    pick.position.copy(STATIONS[key].position)
    pick.position.y += 0.6
    pick.userData.station = key
    this.picks.push(pick)
    this.scene.add(pick)
    return group
  }

  private addAntenna(group: THREE.Group): void {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.1, 6), flat(COLOR.slate))
    mast.position.set(0.55, 0.78, 0)
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 9, 6, 0, Math.PI, 0, Math.PI),
      flat(COLOR.gold, { side: THREE.DoubleSide })
    )
    dish.position.set(0.55, 1.33, 0)
    dish.rotation.z = Math.PI / 4

    // Beacon light
    this.beaconMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 4),
      flat(COLOR.red, { emissive: COLOR.red, emissiveIntensity: 0.8 })
    )
    this.beaconMesh.position.set(0.55, 1.5, 0)

    group.add(mast, dish, this.beaconMesh)
  }

  private addAstronaut(): void {
    const suit = flat('#f8fafc')
    const dark = flat(COLOR.slate)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.65, 3, 8), suit)
    body.position.y = 0.75
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), flat('#dbeafe', { metalness: 0.08 }))
    helmet.position.y = 1.42
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6, 0, Math.PI, 0, Math.PI / 2), flat(COLOR.gold))
    visor.position.set(0, 1.42, 0.18)
    visor.rotation.x = Math.PI / 2
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.24), flat(COLOR.orange))
    pack.position.set(0, 0.88, -0.38)
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 5), flat(COLOR.gold))
    pointer.position.set(0, 1.9, 0.08)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 12), dark)
    base.position.y = 0.04

    this.astronautBody.add(body, helmet, visor, pack, pointer, base)
    this.astronaut.add(this.astronautBody)
    this.scene.add(this.astronaut)
  }

  private refreshRings(): void {
    for (const key of Object.keys(STATIONS) as StationKey[]) {
      const near = this.astronaut.position.distanceTo(STATIONS[key].position) <= 2.2
      const selected = key === this.lastSelected
      const mat = this.rings[key].material as THREE.MeshStandardMaterial
      mat.color.set(near || selected ? COLOR.gold : COLOR.pale)
      mat.opacity = near ? 0.88 : selected ? 0.58 : 0.28
    }
  }
}
