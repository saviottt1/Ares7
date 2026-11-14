export function manusGameTuning() {
  return {
    name: 'manus-game-tuning',
    configureServer(server) {
      server.middlewares.use('/__manus__/tuning', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'ok', tuning: true }))
          return
        }
        next()
      })
    },
  }
}

export default manusGameTuning
