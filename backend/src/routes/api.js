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
const recurringPaymentController = require('../controllers/recurringPaymentController');
const categoryController = require('../controllers/categoryController');
const payerController = require('../controllers/payerController');
const agreementController = require('../controllers/agreementController');
const overviewController = require('../controllers/overviewController');
const debtController = require('../controllers/debtController');
const reminderController = require('../controllers/reminderController');
const { forOwner } = require('../lib/ownerDb');

// Public auth routes
router.post('/auth/login', wrap(authController.login));

// Authenticated, password change allowed while flagged
router.get('/auth/profile', authenticate, wrap(authController.getProfile));
router.post('/auth/change-password', authenticate, wrap(authController.changePassword));

// Family accounts administration (ADMIN only)
router.get('/admin/members', authenticate, requireRole('ADMIN'), wrap(adminController.listMembers));
router.post('/admin/members', authenticate, requireRole('ADMIN'), wrap(adminController.createMember));
router.put('/admin/members/:id', authenticate, requireRole('ADMIN'), wrap(adminController.updateMember));

// Scheduled jobs: authenticated by X-Job-Key (JOB_SECRET), not a user session
router.post('/jobs/rent-reminders', wrap(reminderController.rentReminders));

// Owner routes: every query below goes through req.db, pinned to the caller's ownerId.
const ownerScope = (req, res, next) => { req.db = forOwner(req.user.id); next(); };
router.use(authenticate, requirePasswordChanged, requireRole('ADMIN', 'MEMBER'), ownerScope);

// Account preferences
router.put('/me/preferences', wrap(authController.updatePreferences));

// Dashboard
router.get('/dashboard', wrap(dashboardController.getDashboardStats));

// Analytics
router.get('/analytics/monthly', wrap(dashboardController.getMonthlyAnalytics));

// Combined overview + calendar across lending and every category
router.get('/overview', wrap(overviewController.getOverview));
router.get('/calendar', wrap(overviewController.getCalendar));

// Borrowers
router.get('/borrowers', wrap(borrowerController.getBorrowers));
router.get('/borrowers/:id', wrap(borrowerController.getBorrowerById));
router.post('/borrowers', wrap(borrowerController.createBorrower));
router.put('/borrowers/:id', wrap(borrowerController.updateBorrower));
router.delete('/borrowers/:id', wrap(borrowerController.deleteBorrower));

// Loans
router.post('/loans', wrap(loanController.createLoan));
router.put('/loans/:id', wrap(loanController.updateLoan));
router.put('/loans/:id/status', wrap(loanController.updateLoanStatus));
router.delete('/loans/:id', wrap(loanController.deleteLoan));

// Interest Records (Quick Clear Due)
router.put('/interest-records/:id/clear', wrap(loanController.clearInterestRecord));

// Payments (FIFO)
router.post('/payments', wrap(paymentController.recordPayment));
router.get('/payments', wrap(paymentController.getPaymentHistory));
router.put('/payments/:id', wrap(paymentController.updatePayment));
router.delete('/payments/:id', wrap(paymentController.deletePayment));

// Recurring payments (FIFO over dues, rebuilt on every write)
router.post('/recurring-payments', wrap(recurringPaymentController.createPayment));
router.put('/recurring-payments/:id', wrap(recurringPaymentController.updatePayment));
router.delete('/recurring-payments/:id', wrap(recurringPaymentController.deletePayment));

// Categories → places → units
router.get('/categories', wrap(categoryController.listCategories));
router.post('/categories', wrap(categoryController.createCategory));
router.get('/categories/:id', wrap(categoryController.getCategory));
router.get('/categories/:id/dashboard', wrap(categoryController.getDashboard));
router.get('/categories/:id/export', wrap(reportController.exportCategory));
router.put('/categories/:id', wrap(categoryController.updateCategory));
router.delete('/categories/:id', wrap(categoryController.deleteCategory));
router.post('/categories/:id/places', wrap(categoryController.createPlace));
router.put('/places/:id', wrap(categoryController.updatePlace));
router.post('/places/:id/units', wrap(categoryController.createUnit));
router.put('/units/:id', wrap(categoryController.updateUnit));

// Payers and their logins
router.get('/payers', wrap(payerController.listPayers));
router.post('/payers', wrap(payerController.createPayer));
router.get('/payers/:id', wrap(payerController.getPayer));
router.put('/payers/:id', wrap(payerController.updatePayer));
router.post('/payers/:id/login', wrap(payerController.createLogin));
router.put('/payers/:id/login', wrap(payerController.updateLogin));

// Agreements: move-in, billing, rates, advance, move-out settlement
router.post('/agreements/preview', wrap(agreementController.previewAgreement));
router.post('/agreements', wrap(agreementController.createAgreement));
router.get('/agreements/:id', wrap(agreementController.getAgreement));
router.put('/agreements/:id/billing', wrap(agreementController.updateBilling));
router.post('/agreements/:id/rates', wrap(agreementController.addRate));
router.post('/agreements/:id/advance', wrap(agreementController.addAdvance));
router.post('/agreements/:id/move-out/preview', wrap(agreementController.moveOutPreview));
router.post('/agreements/:id/move-out', wrap(agreementController.moveOut));

// Money I owe: creditors and their BORROWED / REPAID log
router.get('/creditors', wrap(debtController.listCreditors));
router.post('/creditors', wrap(debtController.createCreditor));
router.get('/creditors/:id', wrap(debtController.getCreditor));
router.put('/creditors/:id', wrap(debtController.updateCreditor));
router.delete('/creditors/:id', wrap(debtController.deleteCreditor));
router.post('/creditors/:id/entries', wrap(debtController.addEntry));
router.delete('/debt-entries/:id', wrap(debtController.deleteEntry));

// Reports
router.get('/reports/excel', wrap(reportController.exportExcelReport));

module.exports = router;
