module.exports = function(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
};