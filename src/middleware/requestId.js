module.exports = function requestId() {
    return (req, _res, next) => {
        req.requestId = Math.random().toString(36).slice(2);
        next();
    };
};
