import React from 'react';
import { Box } from 'lucide-react';

const ModeloDetailsModal = ({ isOpen, onClose, modelo }) => {
  if (!isOpen || !modelo) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex justify-center items-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2 flex items-center">
          <Box className="h-6 w-6 mr-2 text-green-500" />
          Detalhes do Modelo: {modelo.nome}
        </h2>
        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">SKU:</p>
            <p className="text-lg text-gray-900">{modelo.sku}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Tempo de Montagem Adicional:</p>
            <p className="text-lg text-gray-900">{modelo.tempoMontagemAdicional || 0} min</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Peças Componentes:</p>
            {modelo.pecas && modelo.pecas.length > 0 ? (
              <ul className="list-disc list-inside text-gray-700">
                {modelo.pecas.map((item, index) => (
                  <li key={index}>
                    {item.peca?.nome} (SKU: {item.peca?.sku}) (x{item.quantidade})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">Nenhuma peça componente.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-700">Tempo de Impressão Total:</p>
              <p className="text-lg font-semibold text-gray-900">{modelo.tempoImpressao || 0} min</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Tempo de Montagem Total:</p>
              <p className="text-lg font-semibold text-gray-900">{modelo.tempoMontagem || 0} min</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Consumo de Filamento Total:</p>
              <p className="text-lg font-semibold text-gray-900">{modelo.consumoFilamento?.toFixed(2) || '0.00'} g</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Custo Calculado:</p>
              <p className="text-lg font-semibold text-green-600">R$ {modelo.custoCalculado?.toFixed(2) || '0.00'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Grupos de Impressão Otimizado:</p>
              <p className="text-lg font-semibold text-gray-900">{modelo.gruposImpressaoOtimizado || 0}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Grupos de Impressão Total:</p>
              <p className="text-lg font-semibold text-gray-900">{modelo.gruposImpressaoTotal || 0}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-4 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModeloDetailsModal;
