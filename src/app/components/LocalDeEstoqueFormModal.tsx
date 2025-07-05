import React, { useState, useEffect } from 'react';
import { LocalDeEstoque } from '../types/mapaEstoque';

interface LocalDeEstoqueFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (local: LocalDeEstoque) => void;
  initialData?: LocalDeEstoque | null;
}

const LocalDeEstoqueFormModal: React.FC<LocalDeEstoqueFormModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [nome, setNome] = useState(initialData?.nome || '');
  const [tipo, setTipo] = useState<LocalDeEstoque['tipo']>(initialData?.tipo || 'gaveta');
  const [dimX, setDimX] = useState(initialData?.dimensoesGrade.x || 1);
  const [dimY, setDimY] = useState(initialData?.dimensoesGrade.y || 1);
  const [dimZ, setDimZ] = useState(initialData?.dimensoesGrade.z || 1);

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome);
      setTipo(initialData.tipo);
      setDimX(initialData.dimensoesGrade.x);
      setDimY(initialData.dimensoesGrade.y);
      setDimZ(initialData.dimensoesGrade.z);
    } else {
      setNome('');
      setTipo('gaveta');
      setDimX(1);
      setDimY(1);
      setDimZ(1);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: LocalDeEstoque = {
      nome,
      tipo,
      dimensoesGrade: { x: dimX, y: dimY, z: dimZ },
    };
    if (initialData?.id) {
      local.id = initialData.id;
    }
    onSave(local);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
          {initialData ? 'Editar Local de Estoque' : 'Novo Local de Estoque'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome do Local</label>
            <input
              type="text"
              id="nome"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="tipo" className="block text-sm font-medium text-gray-700">Tipo de Local</label>
            <select
              id="tipo"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as LocalDeEstoque['tipo'])}
              required
            >
              <option value="gaveta">Gaveta</option>
              <option value="prateleira">Prateleira</option>
              <option value="armario">Armário</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Dimensões da Grade (X x Y x Z)</label>
            <div className="mt-1 grid grid-cols-3 gap-3">
              <input
                type="number"
                placeholder="X"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={dimX}
                onChange={(e) => setDimX(parseInt(e.target.value) || 1)}
                min="1"
                required
              />
              <input
                type="number"
                placeholder="Y"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={dimY}
                onChange={(e) => setDimY(parseInt(e.target.value) || 1)}
                min="1"
                required
              />
              <input
                type="number"
                placeholder="Z"
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={dimZ}
                onChange={(e) => setDimZ(parseInt(e.target.value) || 1)}
                min="1"
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3">
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

export default LocalDeEstoqueFormModal;
