import React, { useState } from 'react';

const RegistrationInput = ({ onSubmit }) => {
  const [registration, setRegistration] = useState('');
  const [error, setError] = useState('');

  // UK vehicle registration validator
  const isValidUKRegistration = (reg) => {
    // Remove spaces and convert to uppercase
    const formatted = reg.replace(/\s+/g, '').toUpperCase();
    
    // Common UK registration patterns
    // Current format: 2 letters, 2 numbers, 2 letters (e.g., AB12CDE)
    // Older format: 1 letter, 1-3 numbers, 1-3 letters (e.g., A123BCD)
    // Northern Ireland: 1-3 letters, 1-4 numbers (e.g., ABC1234)
    // Diplomatic: format starting with 'D' or 'X' (e.g., D123)
    // Also handles personalized plates
    
    // Basic length check (most UK registrations are between 2-7 characterss)
    if (formatted.length < 2 || formatted.length > 8) {
      return false;
    }
    
    // Basic character check (only letters and numbers allowed)
    if (!/^[A-Z0-9]+$/.test(formatted)) {
      return false;
    }
    
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    // Format registration - remove spaces, convert to uppercase
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    if (!isValidUKRegistration(formattedReg)) {
      setError('Please enter a valid UK registration number');
      return;
    }
    
    onSubmit(formattedReg);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col space-y-2">
        <label htmlFor="registration" className="font-medium text-gray-700">
          Vehicle Registration
        </label>
        <div className="flex">
          <input
            type="text"
            id="registration"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            placeholder="Enter registration (e.g. AB12CDE)"
            className="flex-1 p-2 border border-gray-300 rounded-l focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-r hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Search
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-1">
            {error}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Enter a UK vehicle registration to check its MOT history
        </p>
      </div>
    </form>
  );
};

export default RegistrationInput;