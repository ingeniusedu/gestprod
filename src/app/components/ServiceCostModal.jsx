"use client";

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ServiceCostModal = ({ isOpen, onClose }) => {
  const [costPerMinute3DPrint, setCostPerMinute3DPrint] = useState('');
  const [costPerMinuteAssembly, setCostPerMinuteAssembly] = useState('');
  const [costPerMinutePackaging, setCostPerMinutePackaging] = useState('');

  useEffect(() => {
    const fetchServiceCosts = async () => {
      try {
        const docRef = doc(db, 'settings', 'serviceCosts');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCostPerMinute3DPrint(data.costPerMinute3DPrint || '');
          setCostPerMinuteAssembly(data.costPerMinuteAssembly || '');
          setCostPerMinutePackaging(data.costPerMinutePackaging || '');
        }
      } catch (error) {
        console.error("Error fetching service costs: ", error);
      }
    };

    if (isOpen) {
      fetchServiceCosts();
    }
  }, [isOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const docRef = doc(db, 'settings', 'serviceCosts');
      await setDoc(docRef, {
        costPerMinute3DPrint: parseFloat(costPerMinute3DPrint) || 0,
        costPerMinuteAssembly: parseFloat(costPerMinuteAssembly) || 0,
        costPerMinutePackaging: parseFloat(costPerMinutePackaging) || 0,
      }, { merge: true });
      onClose();
    } catch (error) {
      console.error("Error saving service costs: ", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-md mx-4">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">
            Configurar Custos de Serviço
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div>
            <label htmlFor="costPerMinute3DPrint" className="block text-sm font-medium text-gray-700">
              Custo por Minuto de Impressão (R$)
            </label>
            <input
              type="number"
              id="costPerMinute3DPrint"
              name="costPerMinute3DPrint"
              value={costPerMinute3DPrint}
              onChange={(e) => setCostPerMinute3DPrint(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              step="0.01"
              required
            />
          </div>
          <div>
            <label htmlFor="costPerMinuteAssembly" className="block text-sm font-medium text-gray-700">
              Custo por Minuto de Montagem (R$)
            </label>
            <input
              type="number"
              id="costPerMinuteAssembly"
              name="costPerMinuteAssembly"
              value={costPerMinuteAssembly}
              onChange={(e) => setCostPerMinuteAssembly(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              step="0.01"
              required
            />
          </div>
          <div>
            <label htmlFor="costPerMinutePackaging" className="block text-sm font-medium text-gray-700">
              Custo por Minuto de Embalagem (R$)
            </label>
            <input
              type="number"
              id="costPerMinutePackaging"
              name="costPerMinutePackaging"
              value={costPerMinutePackaging}
              onChange={(e) => setCostPerMinutePackaging(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              step="0.01"
              required
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ServiceCostModal;
