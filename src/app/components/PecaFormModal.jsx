import React, { useState, useEffect } from 'react';
import { X, Save, Plus, MapPin, Calendar } from 'lucide-react';
import { db } from '../services/firebase'; // Import db
import { collection, getDocs } from 'firebase/firestore'; // Import Firestore functions

const predefinedLocations = [
  'Balcão 1', 'Balcão 2', 'Balcão 3', 'Balcão 4',
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4',
  'Aéreo 1', 'Aéreo 2', 'Aéreo 3', 'Aéreo 4'
];

export default function PecaFormModal({ isOpen, onClose, onSave, initialData }) {
  const [pecaData, setPecaData] = useState(initialData || {});
  const [newLocation, setNewLocation] = useState('');
  const [customLocations, setCustomLocations] = useState([]);
  const [availableFilaments, setAvailableFilaments] = useState([]); // State to store fetched filaments

  useEffect(() => {
    const fetchAvailableFilaments = async () => {
      try {
        const insumosCollection = collection(db, 'insumos');
        const insumoSnapshot = await getDocs(insumosCollection);
        const filamentsList = insumoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(i => i.tipo === 'filamento');
        setAvailableFilaments(filamentsList);
      } catch (error) {
        console.error("Error fetching available filaments: ", error);
      }
    };

    if (isOpen) {
      fetchAvailableFilaments();
      if (initialData) {
        setPecaData({
          ...initialData,
          gruposImpressao: (initialData.gruposImpressao || []).map(grupo => ({
            ...grupo,
            filamentos: (grupo.filamentos || []).map(filamento => {
              const selectedFilament = availableFilaments.find(f => f.id === filamento.filamentoId);
              return {
                ...filamento,
                nome: selectedFilament ? selectedFilament.nome : '',
                isAlternative: filamento.isAlternative || false,
                alternativeFilaments: (filamento.alternativeFilaments || []).map(altF => {
                  const selectedAltFilament = availableFilaments.find(f => f.id === altF.filamentoId);
                  return {
                    ...altF,
                    nome: selectedAltFilament ? selectedAltFilament.nome : '',
                  };
                })
              };
            })
          }))
        });
      } else {
        setPecaData({}); // Reset pecaData for new entry
      }
      const storedCustomLocations = JSON.parse(localStorage.getItem('customLocations')) || [];
      setCustomLocations(storedCustomLocations);
    }
  }, [initialData, isOpen, availableFilaments.length]); // Added availableFilaments.length to dependency array

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPecaData(prev => ({ ...prev, [name]: value }));
  };

  const handlePartChange = (grupoIndex, parteIndex, field, value) => {
    setPecaData(prev => {
      const newGruposImpressao = [...(prev.gruposImpressao || [])];
      if (newGruposImpressao[grupoIndex] && newGruposImpressao[grupoIndex].partes) {
        const newPartes = [...newGruposImpressao[grupoIndex].partes];
        newPartes[parteIndex] = { ...newPartes[parteIndex], [field]: value };
        newGruposImpressao[grupoIndex] = { ...newGruposImpressao[grupoIndex], partes: newPartes };
      }
      return { ...prev, gruposImpressao: newGruposImpressao };
    });
  };

  const handleAddLocation = () => {
    if (newLocation && !predefinedLocations.includes(newLocation) && !customLocations.includes(newLocation)) {
      const updatedCustomLocations = [...customLocations, newLocation];
      setCustomLocations(updatedCustomLocations);
      localStorage.setItem('customLocations', JSON.stringify(updatedCustomLocations));
      setNewLocation('');
    }
  };

  const handleSave = () => {
    onSave(pecaData);
    onClose();
  };

  const allLocations = [...predefinedLocations, ...customLocations];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="relative p-8 border w-full max-w-2xl md:max-w-3xl lg:max-w-4xl shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-3 border-b border-gray-200">
          <h3 className="text-2xl font-semibold text-gray-900">
            Editar {pecaData.isPecaComposta ? 'Peça Composta' : 'Peça'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          {/* Main Piece Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome da Peça</label>
              <input
                type="text"
                name="nome"
                id="nome"
                value={pecaData.nome || ''}
                onChange={handleInputChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                readOnly
              />
            </div>
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU</label>
              <input
                type="text"
                name="sku"
                id="sku"
                value={pecaData.sku || ''}
                onChange={handleInputChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                readOnly
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="quantidadeEmEstoque" className="block text-sm font-medium text-gray-700">Estoque da Peça</label>
              <input
                type="number"
                name="quantidadeEmEstoque"
                id="quantidadeEmEstoque"
                value={pecaData.quantidadeEmEstoque || 0}
                onChange={handleInputChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="dataEstoque" className="block text-sm font-medium text-gray-700">Data do Estoque</label>
              <input
                type="date"
                name="dataEstoque"
                id="dataEstoque"
                value={pecaData.dataEstoque ? new Date(pecaData.dataEstoque.seconds * 1000).toISOString().split('T')[0] : ''}
                onChange={handleInputChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="local" className="block text-sm font-medium text-gray-700">Local da Peça</label>
              <select
                name="local"
                id="local"
                value={pecaData.local || ''}
                onChange={handleInputChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Selecione um local</option>
                {allLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
              <div className="flex mt-2">
                <input
                  type="text"
                  placeholder="Novo local"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="flex-grow border border-gray-300 rounded-l-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleAddLocation}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Parts (if composed piece) */}
          {pecaData.isPecaComposta && pecaData.gruposImpressao && pecaData.gruposImpressao.length > 0 && (
            <div className="mt-8">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Partes da Peça Composta</h4>
              {pecaData.gruposImpressao.map((grupo, grupoIndex) => (
                <div key={grupoIndex} className="border border-gray-200 rounded-md p-4 mb-4 bg-gray-50">
                  <h5 className="text-md font-semibold text-gray-800 mb-3">Grupo {grupoIndex + 1}</h5>
                  {grupo.partes && grupo.partes.length > 0 ? (
                    grupo.partes.map((parte, parteIndex) => (
                      <div key={parteIndex} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-3 border border-gray-100 rounded-md bg-white">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Nome da Parte</label>
                          <input
                            type="text"
                            value={parte.nome || ''}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Estoque da Parte</label>
                          <input
                            type="number"
                            value={parte.estoque || 0}
                            onChange={(e) => handlePartChange(grupoIndex, parteIndex, 'estoque', parseFloat(e.target.value))}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Local da Parte</label>
                          <select
                            value={parte.local || ''}
                            onChange={(e) => handlePartChange(grupoIndex, parteIndex, 'local', e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            <option value="">Selecione um local</option>
                            {allLocations.map(loc => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">Nenhuma parte neste grupo.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}
