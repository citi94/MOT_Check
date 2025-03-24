import React, { useState } from 'react';

const RegistrationInput = ({ onSubmit }) => {
  const [registration, setRegistration] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Format registration - remove spaces, convert to uppercase
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    if (formattedReg.length < 2) {
      alert('Please enter a valid registration number');
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
        <p className="text-xs text-gray-500">
          Enter a UK vehicle registration to check its MOT history
        </p>
      </div>
    </form>
  );
};

export default RegistrationInput;