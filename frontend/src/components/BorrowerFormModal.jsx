import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Modal, Button, Field, ErrorNote } from './ui';

export default function BorrowerFormModal({ isOpen, onClose, onSuccess, borrowerToEdit = null }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(borrowerToEdit?.name || '');
    setPhone(borrowerToEdit?.phone || '');
    setAddress(borrowerToEdit?.address || '');
    setNotes(borrowerToEdit?.notes || '');
    setError('');
  }, [borrowerToEdit, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name || !phone) {
      setError('Name and Phone are required');
      return;
    }
    try {
      setSubmitting(true);
      const body = { name, phone, address, notes };
      if (borrowerToEdit) await api.updateBorrower(borrowerToEdit.id, body);
      else await api.createBorrower(body);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save borrower');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={borrowerToEdit ? 'Edit Borrower' : 'Add New Borrower'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Full name *" placeholder="e.g. Ramesh Kumar" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field label="Phone number *" type="tel" placeholder="e.g. 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Field label="Address (optional)" placeholder="e.g. Sector 12, Main Road" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div>
          <label htmlFor="borrower-notes" className="mb-1.5 block text-sm font-extrabold">Notes / references (optional)</label>
          <textarea id="borrower-notes" rows={2} className="field" placeholder="e.g. Referred by Suresh" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : borrowerToEdit ? 'Update Borrower' : 'Create Borrower'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
