//-------------------------------
// Config
//-------------------------------

//Declaraciones
//-------------------------------
const express = require('express')
const path = require('path')
const fs = require('fs')
const session = require('express-session')
const cookieParser = require('cookie-parser')

const app = express()
const PORT = 3000

//SET & USE
//-------------------------------
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(
  session({
    secret: 'secret-suenos-valenti',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Tiempo de vida de la cookie: 1 hora
      maxAge: 1000 * 60 * 60
    }
  })
)

//Leer sesiones del json
function leerSesiones() {
  const filePath = path.join(__dirname, 'data', 'sesiones.json')
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const sesiones = JSON.parse(raw || '[]')
    return Array.isArray(sesiones) ? sesiones : []
  } catch (e) {
    return []
  }
}

//Logs
function escribirLog(req, mensaje) {
  const filePath = path.join(__dirname, 'data', 'logs.txt')

  const fecha = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const usuario = req.session.usuario ? req.session.usuario.email : 'anonimo'

  const linea = `${fecha} | ${usuario} | ${mensaje}\n`

  fs.appendFile(filePath, linea, (err) => {
    if (err) console.error('Error escribiendo log')
  })
}

// Middleware para proteger rutas privadas
function requireLogin(req, res, next) {
  if (!req.session.usuario) return res.redirect('/login')
  next()
}

//-------------------------------
// GET
//-------------------------------
app.get('/', (req, res) => {
  const tema = req.cookies.tema || 'claro'
  res.render('inicio', { tema, usuario: req.session.usuario })
})

app.get('/registro', (req, res) => {
  const tema = req.cookies.tema || 'claro'
  res.render('registro', { errores: [], form: {}, tema })
})

app.get('/login', (req, res) => {
  const tema = req.cookies.tema || 'claro'
  res.render('login', { error: null, tema })
})

app.get('/perfil', requireLogin, (req, res) => {
  escribirLog(req, 'Accede a /perfil')
  const tema = req.cookies.tema || 'claro'
  res.render('perfil', { usuario: req.session.usuario, tema })
})

app.get('/preferencias', (req, res) => {
  const tema = req.cookies.tema || 'claro'
  res.render('preferencias', { tema })
})

app.get('/tema/:modo', (req, res) => {
  const modo = req.params.modo

  res.cookie('tema', modo, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7
  })

  res.redirect('/preferencias')
})

app.get('/borrar-tema', (req, res) => {
  res.clearCookie('tema')
  res.redirect('/preferencias')
})

app.get('/sesiones', (req, res) => {
  escribirLog(req, 'Accede a /sesiones')
  const tema = req.cookies.tema || 'claro'
  const sesiones = leerSesiones()

  const flash = req.session.flash
  req.session.flash = null

  res.render('sesiones', { tema, sesiones, flash })
})

//No dejamos ver el carrito hasta que inicie sesión
app.get('/carrito', (req, res) => {
  if (!req.session.usuario) {
    req.session.flash = {
      tipo: 'error',
      mensaje: '🔒 No puedes ver el carrito hasta iniciar sesión'
    }
    return res.redirect('/sesiones')
  }
  escribirLog(req, 'Accede a /carrito')
  const tema = req.cookies.tema || 'claro'
  const carrito = req.session.carrito || []

  const total = carrito.reduce((acc, s) => acc + (Number(s.precio) || 0), 0)

  res.render('carrito', { tema, carrito, total })
})

//-------------------------------
// POST
//-------------------------------

app.post('/registro', (req, res) => {
  const { nombre, email, edad, ciudad, intereses } = req.body

  const errores = []

  // Validaciones mínimas
  if (!nombre || nombre.trim().length < 2) {
    errores.push('El nombre es obligatorio y debe tener al menos 2 caracteres.')
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')
  if (!emailOk) {
    errores.push('El email no es válido.')
  }

  const edadNum = Number(edad)
  if (!Number.isFinite(edadNum) || edadNum <= 0) {
    errores.push('La edad debe ser un número mayor que 0.')
  }

  // Si hay errores, devolvemos el formulario con datos
  if (errores.length) {
    const tema = req.cookies.tema || 'claro'
    return res.status(400).render('registro', {
      errores,
      form: { nombre, email, edad, ciudad, intereses },
      tema
    })
  }

  // Ruta al archivo JSON
  const filePath = path.join(__dirname, 'data', 'usuarios.json')

  // Leer usuarios existentes
  let usuarios = []
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    usuarios = JSON.parse(raw || '[]')
    if (!Array.isArray(usuarios)) usuarios = []
  } catch (e) {
    usuarios = []
  }

  // Evitar emails duplicados
  const normalizedEmail = email.trim().toLowerCase()
  const exists = usuarios.some(
    (u) => (u.email || '').toLowerCase() === normalizedEmail
  )
  if (exists) {
    const tema = req.cookies.tema || 'claro'
    return res.status(400).render('registro', {
      errores: ['Ya existe un usuario con ese email.'],
      form: { nombre, email, edad, ciudad, intereses },
      tema
    })
  }

  // ID ascendente
  let nextId = 1
  if (usuarios.length > 0) {
    const last = usuarios[usuarios.length - 1]
    nextId = (Number(last.id) || 0) + 1
  }

  // Construir usuario
  const user = {
    id: nextId,
    nombre: nombre.trim(),
    email: normalizedEmail,
    edad: edadNum,
    ciudad: (ciudad || '').trim(),
    intereses: Array.isArray(intereses)
      ? intereses
      : intereses
      ? [intereses]
      : []
  }

  // Guardar
  usuarios.push(user)
  fs.writeFileSync(filePath, JSON.stringify(usuarios, null, 2), 'utf-8')
  escribirLog(req, 'Se registra')
  // Redirigir a login
  res.redirect('/login')
})

app.post('/login', (req, res) => {
  const { email, password } = req.body

  // Contraseña fija
  if (password !== '1234') {
    const tema = req.cookies.tema || 'claro'
    return res
      .status(401)
      .render('login', { error: 'Credenciales incorrectas', tema })
  }

  const filePath = path.join(__dirname, 'data', 'usuarios.json')
  let usuarios = []

  try {
    usuarios = JSON.parse(fs.readFileSync(filePath, 'utf-8') || '[]')
    if (!Array.isArray(usuarios)) usuarios = []
  } catch (e) {
    usuarios = []
  }

  const usuario = usuarios.find(
    (u) => (u.email || '').toLowerCase() === (email || '').trim().toLowerCase()
  )

  if (!usuario) {
    const tema = req.cookies.tema || 'claro'
    return res
      .status(404)
      .render('login', { error: 'Usuario no encontrado', tema })
  }

  // Crear sesión
  req.session.usuario = {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    edad: usuario.edad,
    ciudad: usuario.ciudad,
    intereses: usuario.intereses
  }

  escribirLog(req, 'Inicia sesión')
  res.redirect('/perfil')
})

app.post('/logout', (req, res) => {
  escribirLog(req, `Cierra sesión`)
  req.session.destroy(() => {
    res.redirect('/')
  })
})

//Agregar al carrito
app.post('/carrito/agregar', (req, res) => {
  if (!req.session.usuario) {
    req.session.flash = {
      tipo: 'error',
      mensaje: '🔒 No puedes añadir al carrito hasta iniciar sesión'
    }
    return res.redirect('/sesiones')
  }
  const id = Number(req.body.sesionId)

  const sesiones = leerSesiones()
  const sesion = sesiones.find((s) => Number(s.id) === id)

  if (!sesion) return res.redirect('/sesiones')

  if (!req.session.carrito) req.session.carrito = []
  req.session.carrito.push(sesion)

  req.session.flash = {
    tipo: 'ok',
    mensaje: `🛒 Sesión "${sesion.nombre}" añadida al carrito`
  }

  res.redirect('/sesiones')
  escribirLog(req, `Agrega "${sesion.nombre}" al carrito`)
})

//Vaciar el carrito
app.post('/carrito/vaciar', (req, res) => {
  escribirLog(req, 'Vacía el carrito')
  req.session.carrito = []
  res.redirect('/carrito')
})

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`)
})
