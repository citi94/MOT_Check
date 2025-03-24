import React from 'react';

const MOTHistory = ({ vehicleData }) => {
  // Function to format date from ISO string
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  // Handle case where vehicle is newly registered with no MOT tests yet
  const isNewVehicle = !vehicleData.motTests || vehicleData.motTests.length === 0;

  return (
    <div className="bg-white p-4 rounded-lg">
      <div className="vehicle-details mb-4">
        <h2 className="text-xl font-bold mb-2 text-gray-800">Vehicle Details</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="font-semibold">Registration:</div>
          <div>{vehicleData.registration || 'N/A'}</div>
          
          <div className="font-semibold">Make:</div>
          <div>{vehicleData.make || 'N/A'}</div>
          
          <div className="font-semibold">Model:</div>
          <div>{vehicleData.model || 'N/A'}</div>
          
          <div className="font-semibold">Color:</div>
          <div>{vehicleData.primaryColour || 'N/A'}</div>
          
          <div className="font-semibold">Fuel Type:</div>
          <div>{vehicleData.fuelType || 'N/A'}</div>
          
          <div className="font-semibold">First Used:</div>
          <div>{formatDate(vehicleData.firstUsedDate) || 'N/A'}</div>
          
          <div className="font-semibold">Recall Status:</div>
          <div className={`font-medium ${vehicleData.hasOutstandingRecall === 'Yes' ? 'text-red-600' : 'text-green-600'}`}>
            {vehicleData.hasOutstandingRecall || 'Unknown'}
          </div>
        </div>
      </div>
      
      {isNewVehicle ? (
        <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm">
          <p className="font-medium text-yellow-800">
            No MOT tests found for this vehicle.
          </p>
          {vehicleData.motTestDueDate && (
            <p className="mt-1 text-yellow-700">
              First MOT test due by: {formatDate(vehicleData.motTestDueDate)}
            </p>
          )}
        </div>
      ) : (
        <div className="mot-tests mt-4">
          <h2 className="text-xl font-bold mb-2 text-gray-800">MOT History</h2>
          
          {vehicleData.motTests && vehicleData.motTests.length > 0 ? (
            <div className="space-y-4">
              {vehicleData.motTests
                .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate))
                .map((test, index) => (
                  <div key={index} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-semibold">
                        {formatDate(test.completedDate)}
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-bold ${
                        test.testResult === 'PASSED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {test.testResult}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-1 text-sm mb-2">
                      <div className="text-gray-600">Test Number:</div>
                      <div>{test.motTestNumber || 'N/A'}</div>
                      
                      <div className="text-gray-600">Expiry Date:</div>
                      <div>{formatDate(test.expiryDate)}</div>
                      
                      <div className="text-gray-600">Odometer:</div>
                      <div>
                        {test.odometerValue && test.odometerUnit 
                          ? `${test.odometerValue} ${test.odometerUnit}` 
                          : 'N/A'}
                      </div>
                    </div>
                    
                    {test.defects && test.defects.length > 0 && (
                      <div className="mt-2">
                        <h4 className="font-medium text-sm mb-1">Defects:</h4>
                        <ul className="text-sm space-y-1">
                          {test.defects.map((defect, defIdx) => (
                            <li key={defIdx} className={`pl-2 border-l-2 ${
                              defect.type === 'DANGEROUS' || defect.type === 'MAJOR' 
                                ? 'border-red-500' 
                                : defect.type === 'ADVISORY' 
                                  ? 'border-yellow-500'
                                  : 'border-gray-300'
                            }`}>
                              <span className="font-medium">{defect.type}: </span>
                              {defect.text || 'No details provided'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No MOT test history available</p>
          )}
        </div>
      )}
    </div>
  );
};

export default MOTHistory;