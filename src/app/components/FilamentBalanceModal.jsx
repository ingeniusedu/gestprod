import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

export default function FilamentBalanceModal({ isOpen, onClose, filaments, currentIndex, onUpdate, onNext, onSkip, showConfirmation }) {
  const [currentWeight, setCurrentWeight] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const currentSpool = filaments[currentIndex];

  useEffect(() => {
    if (currentSpool) {
      setCurrentWeight(currentSpool.estoqueAtual ? parseFloat(currentSpool.estoqueAtual).toFixed(2) : '');
      setIsEditing(false); // Reset editing state when spool changes
    }
  }, [currentSpool]);

  if (!isOpen) return null;

  const handleUpdateClick = () => {
    if (currentSpool && currentWeight !== '') {
      onUpdate(currentSpool.id, parseFloat(currentWeight));
    }
    setIsEditing(false);
    onNext();
  };

  const handleKeepSame = () => {
    setIsEditing(false);
    onNext();
  };

  const handleClose = () => {
    onClose();
    setCurrentWeight('');
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-auto p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-6 w-6" />
        </button>

        {showConfirmation ? (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900">Balanço Concluído!</h3>
            <p className="mt-2 text-gray-600">Todos os filamentos foram balanceados com sucesso.</p>
            <button
              onClick={handleClose}
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Balanço de Filamento</h2>
            {filaments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">Nenhum filamento encontrado para balanço.</p>
                <button
                  onClick={handleClose}
                  className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Spool {currentIndex + 1} de {filaments.length}
                </p>

                {currentSpool && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nome do Spool</label>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{currentSpool.nome}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Peso Atual Registrado (gramas)</label>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {parseFloat(currentSpool.estoqueAtual || 0).toFixed(2)} g
                      </p>
                    </div>
                    <div>
                      <label htmlFor="newWeight" className="block text-sm font-medium text-gray-700">
                        Novo Peso (gramas)
                      </label>
                      <input
                        type="number"
                        id="newWeight"
                        name="newWeight"
                        value={currentWeight}
                        onChange={(e) => setCurrentWeight(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Insira o novo peso"
                        step="0.01"
                      />
                    </div>

                    <div className="flex justify-between mt-6">
                      <button
                        onClick={onSkip}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Pular
                      </button>
                      <button
                        onClick={handleKeepSame}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Manter Igual
                      </button>
                      <button
                        onClick={handleUpdateClick}
                        disabled={currentWeight === '' || isNaN(parseFloat(currentWeight))}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Atualizar e Próximo
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
