const express = require('express');
const router = express.Router();

// CORREÇÃO AQUI: Adicionado a extensão .cjs no final
const paymentController = require('../controllers/paymentController.cjs'); 

router.post('/checkout', paymentController.createCheckoutSession);

module.exports = router;