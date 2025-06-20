// routes/cameras.js (crear este archivo)
const express = require('express');
const router = express.Router();

// Ruta temporal básica
router.get('/', (req, res) => {
    res.json({ message: 'Endpoint de cámaras funcionando' });
});

module.exports = router;