const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');
const borrowerController = require('../controllers/borrowerController');
const loanController = require('../controllers/loanController');
const paymentController = require('../controllers/paymentController');
const dashboardController = require('../controllers/dashboardController');
const reportController = require('../controllers/reportController');

// Public auth routes
router.post('/auth/login', authController.login);

// Protected routes (Require JWT Authentication)
router.use(authenticateToken);

// User Profile
router.get('/auth/profile', authController.getProfile);

// Dashboard
router.get('/dashboard', dashboardController.getDashboardStats);

// Borrowers
router.get('/borrowers', borrowerController.getBorrowers);
router.get('/borrowers/:id', borrowerController.getBorrowerById);
router.post('/borrowers', borrowerController.createBorrower);
router.put('/borrowers/:id', borrowerController.updateBorrower);
router.delete('/borrowers/:id', borrowerController.deleteBorrower);

// Loans
router.post('/loans', loanController.createLoan);
router.put('/loans/:id', loanController.updateLoan);
router.put('/loans/:id/status', loanController.updateLoanStatus);
router.delete('/loans/:id', loanController.deleteLoan);

// Interest Records (Quick Clear Due)
router.put('/interest-records/:id/clear', loanController.clearInterestRecord);

// Payments (FIFO)
router.post('/payments', paymentController.recordPayment);
router.get('/payments', paymentController.getPaymentHistory);
router.put('/payments/:id', paymentController.updatePayment);
router.delete('/payments/:id', paymentController.deletePayment);

// Reports
router.get('/reports/excel', reportController.exportExcelReport);

module.exports = router;
