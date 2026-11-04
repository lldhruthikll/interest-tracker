const express = require('express');
const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const { authenticate, requireRole, requirePasswordChanged } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const borrowerController = require('../controllers/borrowerController');
const loanController = require('../controllers/loanController');
const paymentController = require('../controllers/paymentController');
const dashboardController = require('../controllers/dashboardController');
const reportController = require('../controllers/reportController');

// Public auth routes
router.post('/auth/login', wrap(authController.login));

// Authenticated, password change allowed while flagged
router.get('/auth/profile', authenticate, wrap(authController.getProfile));
router.post('/auth/change-password', authenticate, wrap(authController.changePassword));

// Family accounts administration (ADMIN only)
router.get('/admin/members', authenticate, requireRole('ADMIN'), wrap(adminController.listMembers));
router.post('/admin/members', authenticate, requireRole('ADMIN'), wrap(adminController.createMember));
router.put('/admin/members/:id', authenticate, requireRole('ADMIN'), wrap(adminController.updateMember));

// Owner routes (Task 5 adds requireRole + owner scoping)
router.use(authenticate, requirePasswordChanged);

// Dashboard
router.get('/dashboard', dashboardController.getDashboardStats);

// Analytics
router.get('/analytics/monthly', dashboardController.getMonthlyAnalytics);

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
