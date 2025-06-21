import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import PropTypes from 'prop-types';
import { Spool } from 'lucide-react'; // Assuming Spool icon is available or will be added

const initialFabricantes = ['3D Prime', 'Voolt 3D', 'National 3D'];
const initialMateriais = ['PLA', 'PETG', 'TPU'];
const initialTiposFilamento = ['Basic', 'Premium HT', 'Velvet'];
const initialCores = [
  'Amarelo', 'Areia', 'Azul', 'Azul Bebê', 'Azul Cyan', 'Azul macaron', 'Azul Tiffany',
  'Branco', 'Cappuccino', 'Caucasiano', 'Cinza Nintendo', 'Laranja', 'Laranja macaron',
  'Magenta', 'Marrom', 'Natural', 'Preto', 'Rosa Bebê', 'Rosa macaron', 'Roxo',
  'Transição', 'Verde', 'Vermelho', 'Vermelho escuro', 'Verde macaron', 'Verde Menta',
  'Verde neon', 'Verde Oliva'
];

const initialFormState = {
  nome: '',
  tipo: 'filamento', // Default type
  unidade: '',
  custoPorUnidade: 0,
  estoqueAtual: 0,
  estoqueMinimo: 0,
  cor: '',
  especificacoes: {
    fabricante: '',
    tipoFilamento: '',
    material: '',
    numeroSpools: 0,
    tamanhoSpool: '1000',
    valorPagoPorSpool: 0,
    spoolNumero: '',
    autoNumberSpool: true,
    aberto: false,
    dataAbertura: '',
    pesoAtual: 0,
    finalizadoEm: false,
    dataFinalizacao: '',
  },
};

export default function InsumoFormModal({ isOpen, onClose, onSave, initialData, highestExistingSpoolNumber }) {
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [showNewFabricanteInput, setShowNewFabricanteInput] = useState(false);
  const [showNewTipoFilamentoInput, setShowNewTipoFilamentoInput] = useState(false);
  const [showNewMaterialInput, setShowNewMaterialInput] = useState(false);
  const [showNewCorInput, setShowNewCorInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // When editing, populate form with initialData
        setFormData({
          ...initialData,
          // Ensure nested objects are copied to avoid direct mutation
          especificacoes: { ...initialData.especificacoes },
        });
      } else {
        // When creating new, reset to initial state
        const newFormData = { ...initialFormState };
        if (newFormData.especificacoes.autoNumberSpool) {
          newFormData.especificacoes.spoolNumero = `${highestExistingSpoolNumber + 1}`;
        }
        setFormData(newFormData);
      }
      setErrors({});
      setShowNewFabricanteInput(false);
      setShowNewTipoFilamentoInput(false);
      setShowNewMaterialInput(false);
      setShowNewCorInput(false);
    }
  }, [isOpen, initialData, highestExistingSpoolNumber]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const newState = {
        ...prev,
        [name]: type === 'number' ? parseFloat(value) || 0 : (type === 'checkbox' ? checked : value),
      };

      if (name === 'tipo' && value === 'filamento') {
        newState.unidade = 'gramas';
        newState.estoqueAtual = 0;
        newState.estoqueMinimo = 0;
        newState.nome = '';
        newState.especificacoes = {
          fabricante: '',
          tipoFilamento: '',
          material: '',
          numeroSpools: 0,
          tamanhoSpool: '1000',
          valorPagoPorSpool: 0, // New field
          spoolNumero: '', // New field for spool number
          autoNumberSpool: true, // Default to true for new insumos
          aberto: false,
          dataAbertura: '',
          pesoAtual: 0,
          finalizadoEm: false,
          dataFinalizacao: '',
        };
      } else if (name === 'tipo' && prev.tipo === 'filamento' && value !== 'filamento') {
        newState.especificacoes = {};
        newState.unidade = '';
      }
      return newState;
    });
  };

  const handleEspecificacoesChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'fabricante') {
      setShowNewFabricanteInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, fabricante: '' } }));
        return;
      }
    }
    if (name === 'tipoFilamento') {
      setShowNewTipoFilamentoInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, tipoFilamento: '' } }));
        return;
      }
    }
    if (name === 'material') {
      setShowNewMaterialInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, material: '' } }));
        return;
      }
    }

    if (name === 'autoNumberSpool') {
      setFormData(prev => ({
        ...prev,
        especificacoes: {
          ...prev.especificacoes,
          autoNumberSpool: checked,
          spoolNumero: checked ? '' : prev.especificacoes.spoolNumero // Clear manual number if auto is checked
        }
      }));
      return;
    }
    
    setFormData(prev => {
      const newEspecificacoes = {
        ...prev.especificacoes,
        [name]: type === 'number' ? parseFloat(value) || 0 : (type === 'checkbox' ? checked : value),
      };

      // Calculate custoPorUnidade based on valorPagoPorSpool and tamanhoSpool
      if (name === 'valorPagoPorSpool' || name === 'tamanhoSpool') {
        const valorPago = newEspecificacoes.valorPagoPorSpool || 0;
        const tamanho = parseFloat(newEspecificacoes.tamanhoSpool) || 1; // Avoid division by zero
        if (valorPago > 0 && tamanho > 0) {
          return {
            ...prev,
            especificacoes: newEspecificacoes,
            custoPorUnidade: valorPago / tamanho, // Cost per gram
          };
        }
      }
      return {
        ...prev,
        especificacoes: newEspecificacoes,
      };
    });
  };

  const handleCorChange = (e) => {
    const { value } = e.target;
    setShowNewCorInput(value === 'addNew');
    setFormData(prev => ({
      ...prev,
      cor: value === 'addNew' ? '' : value,
    }));
  };

  const validateForm = () => {
    let newErrors = {};

    if (formData.tipo !== 'filamento') {
      if (!formData.nome.trim()) newErrors.nome = 'Nome é obrigatório.';
      if (!formData.unidade.trim()) newErrors.unidade = 'Unidade é obrigatória.';
      if (formData.custoPorUnidade <= 0) newErrors.custoPorUnidade = 'Custo por unidade deve ser maior que zero.';
      if (formData.estoqueAtual < 0) newErrors.estoqueAtual = 'Estoque atual não pode ser negativo.';
      if (formData.estoqueMinimo < 0) newErrors.estoqueMinimo = 'Estoque mínimo não pode ser negativo.';
    }

    if (formData.tipo === 'filamento') {
      if (!formData.cor.trim()) newErrors.cor = 'Cor é obrigatória para filamentos.';
      if (!formData.especificacoes.fabricante.trim()) newErrors.fabricante = 'Fabricante é obrigatório para filamentos.';
      if (!formData.especificacoes.tipoFilamento.trim()) newErrors.tipoFilamento = 'Tipo é obrigatório para filamentos.';
      if (!formData.especificacoes.material.trim()) newErrors.material = 'Material é obrigatório para filamentos.';
      // numeroSpools is only required for new filament creation
      if (!initialData && formData.especificacoes.numeroSpools <= 0) newErrors.numeroSpools = 'Número de Spools deve ser maior que zero.';
      if (!formData.especificacoes.tamanhoSpool) newErrors.tamanhoSpool = 'Tamanho do Spool é obrigatório.';
      if (formData.especificacoes.valorPagoPorSpool <= 0) newErrors.valorPagoPorSpool = 'Valor pago por Spool deve ser maior que zero.';
      // Spool number is only required if not auto-numbering and not editing
      if (!initialData && !formData.especificacoes.autoNumberSpool && formData.especificacoes.spoolNumero.trim() === '') {
        newErrors.spoolNumero = 'Número do Spool é obrigatório quando a numeração automática está desativada.';
      }

      if (formData.especificacoes.aberto && !formData.especificacoes.dataAbertura) newErrors.dataAbertura = 'Data de Abertura é obrigatória.';
      if (formData.especificacoes.aberto && formData.especificacoes.pesoAtual <= 0) newErrors.pesoAtual = 'Peso Atual deve ser maior que zero.';
      if (formData.especificacoes.finalizadoEm && !formData.especificacoes.dataFinalizacao) newErrors.dataFinalizacao = 'Data de Finalização é obrigatória.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // If initialData exists, it means we are editing, so pass the ID
      onSave(initialData ? { ...formData, id: initialData.id } : formData);
    }
  };

  if (!isOpen) return null;

  // Helper to get color for the circle
  const getColorStyle = (colorName) => {
    const colorMap = {
      'Amarelo': '#FFD700', 'Areia': '#C2B280', 'Azul': '#0000FF', 'Azul Bebê': '#89CFF0',
      'Azul Cyan': '#00FFFF', 'Azul macaron': '#ADD8E6', 'Azul Tiffany': '#0ABAB5',
      'Branco': '#FFFFFF', 'Cappuccino': '#6F4E37', 'Caucasiano': '#F0DCB0',
      'Cinza Nintendo': '#808080', 'Laranja': '#FFA500', 'Laranja macaron': '#FFDAB9',
      'Magenta': '#FF00FF', 'Marrom': '#A52A2A', 'Natural': '#F5F5DC',
      'Preto': '#000000', 'Rosa Bebê': '#F4C2C2', 'Rosa macaron': '#FFB6C1',
      'Roxo': '#800080', 'Transição': 'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #0000FF)',
      'Verde': '#008000', 'Vermelho': '#FF0000', 'Vermelho escuro': '#8B0000',
      'Verde macaron': '#90EE90', 'Verde Menta': '#3EB489', 'Verde neon': '#39FF14',
      'Verde Oliva': '#6B8E23'
    };
    return colorMap[colorName] || '#CCCCCC'; // Default to grey if color not found
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center z-50">
      <div className="relative p-8 bg-white w-full max-w-2xl mx-auto rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900">
            {initialData ? 'Editar Insumo' : 'Novo Insumo'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de Insumo (moved to top) */}
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-gray-700">Tipo de Insumo</label>
            <select
              name="tipo"
              id="tipo"
              value={formData.tipo}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="filamento">Filamento</option>
              <option value="material">Material</option>
              <option value="tempo">Tempo</option>
              <option value="outros">Outros</option>
            </select>
          </div>

          {/* Nome (conditionally rendered) */}
          {formData.tipo !== 'filamento' && (
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                name="nome"
                id="nome"
                value={formData.nome}
                onChange={handleChange}
                className={`mt-1 block w-full border ${errors.nome ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
              />
              {errors.nome && <p className="mt-1 text-sm text-red-600">{errors.nome}</p>}
            </div>
          )}

          {/* Unidade e Custo por Unidade (conditionally rendered for non-filament) */}
          {formData.tipo !== 'filamento' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="unidade" className="block text-sm font-medium text-gray-700">Unidade</label>
                <input
                  type="text"
                  name="unidade"
                  id="unidade"
                  value={formData.unidade}
                  onChange={handleChange}
                  className={`mt-1 block w-full border ${errors.unidade ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                />
                {errors.unidade && <p className="mt-1 text-sm text-red-600">{errors.unidade}</p>}
              </div>
              <div>
                <label htmlFor="custoPorUnidade" className="block text-sm font-medium text-gray-700">Custo por Unidade (R$)</label>
                <input
                  type="number"
                  name="custoPorUnidade"
                  id="custoPorUnidade"
                  value={formData.custoPorUnidade}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  className={`mt-1 block w-full border ${errors.custoPorUnidade ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                />
                {errors.custoPorUnidade && <p className="mt-1 text-sm text-red-600">{errors.custoPorUnidade}</p>}
              </div>
            </div>
          )}

          {/* Estoque Atual e Estoque Mínimo (conditionally rendered for non-filament) */}
          {formData.tipo !== 'filamento' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="estoqueAtual" className="block text-sm font-medium text-gray-700">Estoque Atual</label>
                <input
                  type="number"
                  name="estoqueAtual"
                  id="estoqueAtual"
                  value={formData.estoqueAtual}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full border ${errors.estoqueAtual ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                />
                {errors.estoqueAtual && <p className="mt-1 text-sm text-red-600">{errors.estoqueAtual}</p>}
              </div>
              <div>
                <label htmlFor="estoqueMinimo" className="block text-sm font-medium text-gray-700">Estoque Mínimo</label>
                <input
                  type="number"
                  name="estoqueMinimo"
                  id="estoqueMinimo"
                  value={formData.estoqueMinimo}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full border ${errors.estoqueMinimo ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                />
                {errors.estoqueMinimo && <p className="mt-1 text-sm text-red-600">{errors.estoqueMinimo}</p>}
              </div>
            </div>
          )}

          {/* Filament Specific Fields */}
          {formData.tipo === 'filamento' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fabricante" className="block text-sm font-medium text-gray-700">Fabricante</label>
                  <select
                    name="fabricante"
                    id="fabricante"
                    value={formData.especificacoes.fabricante || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.fabricante ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="">Selecione o Fabricante</option>
                    {initialFabricantes.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value="addNew">Adicionar Novo...</option>
                  </select>
                  {showNewFabricanteInput && (
                    <input
                      type="text"
                      name="fabricante"
                      value={formData.especificacoes.fabricante || ''}
                      onChange={handleEspecificacoesChange}
                      placeholder="Novo Fabricante"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  {errors.fabricante && <p className="mt-1 text-sm text-red-600">{errors.fabricante}</p>}
                </div>
                <div>
                  <label htmlFor="material" className="block text-sm font-medium text-gray-700">Material</label>
                  <select
                    name="material"
                    id="material"
                    value={formData.especificacoes.material || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.material ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="">Selecione o Material</option>
                    {initialMateriais.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value="addNew">Adicionar Novo...</option>
                  </select>
                  {showNewMaterialInput && (
                    <input
                      type="text"
                      name="material"
                      value={formData.especificacoes.material || ''}
                      onChange={handleEspecificacoesChange}
                      placeholder="Novo Material"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  {errors.material && <p className="mt-1 text-sm text-red-600">{errors.material}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tipoFilamento" className="block text-sm font-medium text-gray-700">Tipo (Filamento)</label>
                  <select
                    name="tipoFilamento"
                    id="tipoFilamento"
                    value={formData.especificacoes.tipoFilamento || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.tipoFilamento ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="">Selecione o Tipo</option>
                    {initialTiposFilamento.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    <option value="addNew">Adicionar Novo...</option>
                  </select>
                  {showNewTipoFilamentoInput && (
                    <input
                      type="text"
                      name="tipoFilamento"
                      value={formData.especificacoes.tipoFilamento || ''}
                      onChange={handleEspecificacoesChange}
                      placeholder="Novo Tipo"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  {errors.tipoFilamento && <p className="mt-1 text-sm text-red-600">{errors.tipoFilamento}</p>}
                </div>
                <div>
                  <label htmlFor="cor" className="block text-sm font-medium text-gray-700">Cor</label>
                  <select
                    name="cor"
                    id="cor"
                    value={formData.cor || ''}
                    onChange={handleCorChange}
                    className={`mt-1 block w-full border ${errors.cor ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="">Selecione a Cor</option>
                    {initialCores.map(option => (
                      <option key={option} value={option}>
                        <div className="flex items-center">
                          <div 
                            className="w-4 h-4 rounded-full mr-2" 
                            style={{ backgroundColor: getColorStyle(option) }}
                          ></div>
                          {option}
                        </div>
                      </option>
                    ))}
                    <option value="addNew">Adicionar Nova...</option>
                  </select>
                  {showNewCorInput && (
                    <input
                      type="text"
                      name="cor"
                      value={formData.cor || ''}
                      onChange={handleCorChange}
                      placeholder="Nova Cor"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                  {errors.cor && <p className="mt-1 text-sm text-red-600">{errors.cor}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tamanhoSpool" className="block text-sm font-medium text-gray-700">Tamanho do Spool (gramas)</label>
                  <select
                    name="tamanhoSpool"
                    id="tamanhoSpool"
                    value={formData.especificacoes.tamanhoSpool || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.tamanhoSpool ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="">Selecione o tamanho</option>
                    <option value="250">250</option>
                    <option value="500">500</option>
                    <option value="1000">1000</option>
                  </select>
                  {errors.tamanhoSpool && <p className="mt-1 text-sm text-red-600">{errors.tamanhoSpool}</p>}
                </div>
                <div>
                  <label htmlFor="numeroSpools" className="block text-sm font-medium text-gray-700">Número de Spools</label>
                  <input
                    type="number"
                    name="numeroSpools"
                    id="numeroSpools"
                    value={formData.especificacoes.numeroSpools || 0}
                    onChange={handleEspecificacoesChange}
                    min="0"
                    disabled={!!initialData} // Disable if editing existing insumo
                    className={`mt-1 block w-full border ${errors.numeroSpools ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 ${initialData ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {errors.numeroSpools && <p className="mt-1 text-sm text-red-600">{errors.numeroSpools}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="spoolNumero" className="block text-sm font-medium text-gray-700">Número do Spool</label>
                  <input
                    type="text"
                    name="spoolNumero"
                    id="spoolNumero"
                    value={formData.especificacoes.spoolNumero || ''}
                    onChange={handleEspecificacoesChange}
                    disabled={formData.especificacoes.autoNumberSpool}
                    className={`mt-1 block w-full border ${errors.spoolNumero ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 ${formData.especificacoes.autoNumberSpool ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {errors.spoolNumero && <p className="mt-1 text-sm text-red-600">{errors.spoolNumero}</p>}
                </div>
                <div className="flex items-center mt-4">
                  <input
                    id="autoNumberSpool"
                    name="autoNumberSpool"
                    type="checkbox"
                    checked={formData.especificacoes.autoNumberSpool}
                    onChange={handleEspecificacoesChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="autoNumberSpool" className="ml-2 block text-sm font-medium text-gray-700">
                    Numeração Automática
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="valorPagoPorSpool" className="block text-sm font-medium text-gray-700">Valor Pago por Spool (R$)</label>
                <input
                  type="number"
                  name="valorPagoPorSpool"
                  id="valorPagoPorSpool"
                  value={formData.especificacoes.valorPagoPorSpool || 0}
                  onChange={handleEspecificacoesChange}
                  min="0"
                  step="0.01"
                  className={`mt-1 block w-full border ${errors.valorPagoPorSpool ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                />
                {errors.valorPagoPorSpool && <p className="mt-1 text-sm text-red-600">{errors.valorPagoPorSpool}</p>}
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <input
                    id="aberto"
                    name="aberto"
                    type="checkbox"
                    checked={formData.especificacoes.aberto}
                    onChange={handleEspecificacoesChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="aberto" className="ml-2 block text-sm font-medium text-gray-700">
                    Aberto
                  </label>
                </div>
                {formData.especificacoes.aberto && (
                  <>
                    <div>
                      <label htmlFor="dataAbertura" className="block text-sm font-medium text-gray-700">Data de Abertura</label>
                      <input
                        type="date"
                        name="dataAbertura"
                        id="dataAbertura"
                        value={formData.especificacoes.dataAbertura || ''}
                        onChange={handleEspecificacoesChange}
                        className={`mt-1 block w-full border ${errors.dataAbertura ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                      />
                      {errors.dataAbertura && <p className="mt-1 text-sm text-red-600">{errors.dataAbertura}</p>}
                    </div>
                    <div>
                      <label htmlFor="pesoAtual" className="block text-sm font-medium text-gray-700">Peso Atual (g)</label>
                      <input
                        type="number"
                        name="pesoAtual"
                        id="pesoAtual"
                        value={formData.especificacoes.pesoAtual || 0}
                        onChange={handleEspecificacoesChange}
                        min="0"
                        step="0.01"
                        className={`mt-1 block w-full border ${errors.pesoAtual ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                      />
                      {errors.pesoAtual && <p className="mt-1 text-sm text-red-600">{errors.pesoAtual}</p>}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center">
                <input
                  id="finalizadoEm"
                  name="finalizadoEm"
                  type="checkbox"
                  checked={formData.especificacoes.finalizadoEm}
                  onChange={handleEspecificacoesChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="finalizadoEm" className="ml-2 block text-sm font-medium text-gray-700">
                  Finalizado em
                </label>
                {formData.especificacoes.finalizadoEm && (
                  <div className="ml-4">
                    <label htmlFor="dataFinalizacao" className="block text-sm font-medium text-gray-700 sr-only">Data de Finalização</label>
                    <input
                      type="date"
                      name="dataFinalizacao"
                      id="dataFinalizacao"
                      value={formData.especificacoes.dataFinalizacao || ''}
                      onChange={handleEspecificacoesChange}
                      className={`mt-1 block w-full border ${errors.dataFinalizacao ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                    />
                    {errors.dataFinalizacao && <p className="mt-1 text-sm text-red-600">{errors.dataFinalizacao}</p>}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Especificações (for non-filament types) */}
          {formData.tipo !== 'filamento' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Especificações Adicionais</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                {formData.tipo === 'material' && (
                  <>
                    <div>
                      <label htmlFor="materialTipo" className="block text-xs font-medium text-gray-500">Tipo de Material</label>
                      <input
                        type="text"
                        name="tipo"
                        id="materialTipo"
                        value={formData.especificacoes.tipo || ''}
                        onChange={handleEspecificacoesChange}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="volume" className="block text-xs font-medium text-gray-500">Volume/Tamanho</label>
                      <input
                        type="text"
                        name="volume"
                        id="volume"
                        value={formData.especificacoes.volume || ''}
                        onChange={handleEspecificacoesChange}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
                {formData.tipo === 'tempo' && (
                  <div>
                    <label htmlFor="valorHora" className="block text-xs font-medium text-gray-500">Valor da Hora</label>
                    <input
                      type="text"
                      name="valorHora"
                      id="valorHora"
                      value={formData.especificacoes.valorHora || ''}
                      onChange={handleEspecificacoesChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Save className="h-4 w-4 mr-2" />
              {initialData ? 'Salvar Alterações' : 'Cadastrar Insumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

InsumoFormModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  initialData: PropTypes.object,
  highestExistingSpoolNumber: PropTypes.number,
};
