const { getDueDatesForLoan } = require('../services/interestService');

console.log('--- Testing Loan Due Dates Calculation ---');
const startDate = new Date('2026-03-15');
const targetDate = new Date('2026-06-20');

const dueDates = getDueDatesForLoan(startDate, targetDate);
console.log('Start Date:', startDate.toISOString().split('T')[0]);
console.log('Target Date:', targetDate.toISOString().split('T')[0]);
console.log('Due Dates Generated:');
dueDates.forEach((d) => console.log(' -', d.toISOString().split('T')[0]));

if (dueDates.length === 3) {
  console.log('SUCCESS: Correctly generated 3 monthly due dates (April 15, May 15, June 15)!');
} else {
  console.error('ERROR: Unexpected number of due dates generated');
  process.exit(1);
}
