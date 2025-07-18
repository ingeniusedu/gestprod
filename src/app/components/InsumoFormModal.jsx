import { useState, useEffect } from 'react';
import { X, Save, PlusCircle, Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import { db } from '../services/firebase'; // Import db
import { collection, query, where, getDocs, addDoc, runTransaction, doc, serverTimestamp } from 'firebase/firestore'; // Import firestore functions
import { Spool, Package } from 'lucide-react'; // Assuming Spool icon is available or will be added
import InsumoStockPositionModal from './InsumoStockPositionModal';
import { cleanObject } from '../utils/cleanObject'; // Import cleanObject

const initialFabricantes = ['3D Prime', 'National 3D', 'Voolt 3D'].sort();
const initialMateriais = ['PETG', 'PLA', 'TPU'].sort();
const initialTiposFilamento = ['Basic', 'Premium HT', 'Velvet'].sort();
const initialTiposEmbalagem = ['Caixa', 'Envelope', 'Saco'].sort();
const initialMateriaisEmbalagem = ['Algodão', 'Kraft', 'MDF', 'Plástico'].sort();
const initialTiposMaterial = ['Cola', 'Imã circular', 'Imã retangular', 'Placa'].sort();
const initialMateriaisAssociados = ['Acetato de Vinila', 'Aço', 'Cianoacrilato', 'Neodímio'].sort();
const initialCores = [
  'Amarelo', 'Areia', 'Azul', 'Azul Bebê', 'Azul Cyan', 'Azul macaron', 'Azul Tiffany',
  'Branco', 'Cappuccino', '6F4E37', 'Caucasiano', 'Cinza Nintendo', 'Laranja', 'Laranja macaron',
  'Magenta', 'Marrom', 'Natural', 'Preto', 'Rosa Bebê', 'Rosa macaron', 'Roxo',
  'Transição', 'Verde', 'Verde macaron', 'Verde Menta', 'Verde neon', 'Verde Oliva', 'Vermelho', 'Vermelho escuro'
].sort();

const initialFormState = {
  nome: '',
  tipo: 'filamento', // Default type
  unidade: '',
  custoPorUnidade: 0,
  cor: '',
  estoqueAtual: 0, // For non-filament types
  estoqueMinimo: 0, // For non-filament types
  especificacoes: {
    // Filament specific
    fabricante: '',
    tipoFilamento: '',
    material: '',
    numeroSpools: 1,
    tamanhoSpool: '1000',
    valorPagoPorSpool: '',
    spoolNumero: 0, // Change to number
    autoNumberSpool: true,
    aberto: false,
    dataAbertura: '',
    pesoBruto: 0, // New field for gross weight
    pesoLiquido: 0, // New field for net weight
    dataUltimaPesagem: '', // New field for last weighing date
    finalizadoEm: false,
    dataFinalizacao: '',
    lote: '', // New field
    dataFabricacao: '', // New field
    dataCompra: '', // New field
    operacoes: [], // New field for operation IDs
    consumoProducao: 0, // New field for estimated production consumption
    consumoReal: 0, // New field for real consumption (by weighing)

    // Embalagem specific (these fields will only be used if tipo is 'embalagem')
    tipoEmbalagem: '',
    materialEmbalagem: '',
    altura: 0,
    largura: 0,
    profundidade: 0,
    quantidade: 0,
    valorTotalPago: 0, // Field for total paid value
    valorFrete: 0, // Field for freight value
    dataCompraEmbalagem: '',

    // Material specific
    tipoMaterial: '',
    materialAssociado: '',
    usarMedidas: true, // New field for material to indicate if dimensions are used
    altura: 0, // Added for material
    largura: 0, // Added for material
    profundidade: 0, // Added for material
    quantidade: 0, // Added for material
    valorTotalPago: 0, // Added for material
    valorFrete: 0, // Added for material
    dataCompraMaterial: '', // Changed from dataCompraEmbalagem
  },
};

export default function InsumoFormModal({ isOpen, onClose, onSave, initialData, highestExistingSpoolNumber }) {
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [posicoesEstoque, setPosicoesEstoque] = useState([]);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [showNewFabricanteInput, setShowNewFabricanteInput] = useState(false);
  const [showNewTipoFilamentoInput, setShowNewTipoFilamentoInput] = useState(false);
  const [showNewMaterialInput, setShowNewMaterialInput] = useState(false);
  const [showNewCorInput, setShowNewCorInput] = useState(false);
  const [showNewTipoEmbalagemInput, setShowNewTipoEmbalagemInput] = useState(false);
  const [showNewMaterialEmbalagemInput, setShowNewMaterialEmbalagemInput] = useState(false);
  const [showNewTipoMaterialInput, setShowNewTipoMaterialInput] = useState(false);
  const [showNewMaterialAssociadoInput, setShowNewMaterialAssociadoInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // When editing, populate form with initialData
        setFormData(prev => ({
          ...initialData,
          // Ensure nested objects are copied to avoid direct mutation
          especificacoes: {
            ...initialData.especificacoes,
            lote: initialData.especificacoes?.lote || '',
            dataFabricacao: initialData.especificacoes?.dataFabricacao || '',
            dataCompra: initialData.especificacoes?.dataCompra || '',
            pesoBruto: parseFloat(initialData.especificacoes?.pesoBruto || 0),
            pesoLiquido: parseFloat(initialData.especificacoes?.pesoLiquido || 0),
            spoolNumero: parseInt(initialData.especificacoes?.spoolNumero, 10) || 0, // Parse as number
            operacoes: initialData.especificacoes?.operacoes || [],
            consumoProducao: parseFloat(initialData.especificacoes?.consumoProducao || 0),
            consumoReal: parseFloat(initialData.especificacoes?.consumoReal || 0),
            // Embalagem specific fields, only if type is embalagem
            ...(initialData.tipo === 'embalagem' && {
              altura: parseFloat(initialData.especificacoes?.altura || 0),
              largura: parseFloat(initialData.especificacoes?.largura || 0),
              profundidade: parseFloat(initialData.especificacoes?.profundidade || 0),
              // quantidade: parseFloat(initialData.especificacoes?.quantidade || 0), // This will be derived from posicoesEstoque
              valorTotalPago: parseFloat(initialData.especificacoes?.valorTotalPago || 0),
              valorFrete: parseFloat(initialData.especificacoes?.valorFrete || 0),
              dataCompraEmbalagem: initialData.especificacoes?.dataCompraEmbalagem || '',
            }),
            // Material specific fields, only if type is material
            ...(initialData.tipo === 'material' && {
              tipoMaterial: initialData.especificacoes?.tipoMaterial || '',
              materialAssociado: initialData.especificacoes?.materialAssociado || '',
              altura: parseFloat(initialData.especificacoes?.altura || 0),
              largura: parseFloat(initialData.especificacoes?.largura || 0),
              profundidade: parseFloat(initialData.especificacoes?.profundidade || 0),
              // quantidade: parseFloat(initialData.especificacoes?.quantidade || 0), // This will be derived from posicoesEstoque
              valorTotalPago: parseFloat(initialData.especificacoes?.valorTotalPago || 0),
              valorFrete: parseFloat(initialData.especificacoes?.valorFrete || 0),
              dataCompraMaterial: initialData.especificacoes?.dataCompraMaterial || '',
              usarMedidas: initialData.especificacoes?.usarMedidas ?? true, // Ensure it's always a boolean, default to true
            }),
          },
          custoPorUnidade: parseFloat((initialData.custoPorUnidade || 0).toFixed(2)),
          estoqueAtual: parseFloat(initialData.estoqueAtual || 0), // Ensure estoqueAtual is a number
          estoqueMinimo: parseFloat(initialData.estoqueMinimo || 0), // Ensure estoqueMinimo is a number
        }));
        setPosicoesEstoque(initialData.posicoesEstoque || []); // Populate posicoesEstoque from initialData
      } else {
        // When creating new, reset to initial state
        const newFormData = { ...initialFormState };
        if (newFormData.tipo === 'filamento' && newFormData.especificacoes.autoNumberSpool) {
          newFormData.especificacoes.spoolNumero = highestExistingSpoolNumber + 1; // Ensure it's a number
        }
        setFormData(newFormData);
        setPosicoesEstoque([]); // Reset for new insumos
      }
      setErrors({});
      setShowNewFabricanteInput(false);
      setShowNewTipoFilamentoInput(false);
      setShowNewMaterialInput(false);
      setShowNewCorInput(false);
      setShowNewTipoEmbalagemInput(false);
      setShowNewMaterialEmbalagemInput(false);
      setShowNewTipoMaterialInput(false);
      setShowNewMaterialAssociadoInput(false);
    }
  }, [isOpen, initialData, highestExistingSpoolNumber]);

  // Effect to update nome for filament, embalagem, and material types
  useEffect(() => {
    if (formData.tipo === 'filamento') {
      const { fabricante, material, tipoFilamento } = formData.especificacoes;
      const { cor } = formData;
      const generatedName = [fabricante, material, tipoFilamento, cor]
        .filter(Boolean) // Remove empty strings
        .join(' ');

      setFormData(prev => ({
        ...prev,
        nome: generatedName.trim(),
      }));
    } else if (formData.tipo === 'embalagem') {
      const { tipoEmbalagem, materialEmbalagem, altura, largura, profundidade } = formData.especificacoes;
      let dimensions = `${altura}x${largura}`;
      if (profundidade > 0) {
        dimensions += `x${profundidade}`;
      }
      const generatedName = [tipoEmbalagem, materialEmbalagem, dimensions]
        .filter(Boolean)
        .join(' ');
      setFormData(prev => ({
        ...prev,
        nome: generatedName.trim(),
      }));
    } else if (formData.tipo === 'material') {
      const { tipoMaterial, materialAssociado, usarMedidas, altura, largura, profundidade } = formData.especificacoes;
      let generatedNameParts = [tipoMaterial, 'de', materialAssociado];
      if (usarMedidas) {
        let dimensions = `${altura}x${largura}`;
        if (profundidade > 0) {
          dimensions += `x${profundidade}`;
        }
        generatedNameParts.push(dimensions);
      }
      const generatedName = generatedNameParts
        .filter(Boolean)
        .join(' ');
      setFormData(prev => ({
        ...prev,
        nome: generatedName.trim(),
      }));
    }
  }, [formData.tipo, formData.especificacoes.fabricante, formData.especificacoes.material, formData.especificacoes.tipoFilamento, formData.cor,
      formData.especificacoes.tipoEmbalagem, formData.especificacoes.materialEmbalagem,
      formData.especificacoes.tipoMaterial, formData.especificacoes.materialAssociado,
      formData.especificacoes.usarMedidas, formData.especificacoes.altura, formData.especificacoes.largura, formData.especificacoes.profundidade]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const newState = {
        ...prev,
        [name]: type === 'number' ? parseFloat(value) || 0 : (type === 'checkbox' ? checked : value),
      };

      if (name === 'tipo') {
        if (value === 'filamento') {
          newState.unidade = 'gramas';
          newState.estoqueAtual = 0; // Reset estoqueAtual for filaments
          newState.estoqueMinimo = 0; // Reset estoqueMinimo for filaments
          newState.especificacoes = {
            fabricante: '',
            tipoFilamento: '',
            material: '',
            numeroSpools: 1,
            tamanhoSpool: '1000',
            valorPagoPorSpool: '',
            spoolNumero: 0, // Change to number
            autoNumberSpool: true,
            aberto: false,
            dataAbertura: '',
            pesoBruto: 0,
            pesoLiquido: 0,
            dataUltimaPesagem: '',
            finalizadoEm: false,
            dataFinalizacao: '',
            lote: '',
            dataFabricacao: '',
            dataCompra: '',
            operacoes: [],
            consumoProducao: 0,
            consumoReal: 0,
          };
        } else if (value === 'embalagem') {
          newState.unidade = 'unidades';
          if (!initialData) { // Only reset for new insumos
            newState.estoqueAtual = 0;
            newState.estoqueMinimo = 0;
            newState.especificacoes = {
              tipoEmbalagem: '',
              materialEmbalagem: '',
              altura: 0,
              largura: 0,
              profundidade: 0,
              // quantidade: 0, // Removed as it will be derived from posicoesEstoque
              valorTotalPago: 0,
              valorFrete: 0,
              dataCompraEmbalagem: '',
            };
          } else { // When editing, preserve existing embalagem specific data
            newState.especificacoes = {
              ...prev.especificacoes, // Keep existing specificacoes
              tipoEmbalagem: prev.especificacoes.tipoEmbalagem || '',
              materialEmbalagem: prev.especificacoes.materialEmbalagem || '',
              altura: prev.especificacoes.altura || 0,
              largura: prev.especificacoes.largura || 0,
              profundidade: prev.especificacoes.profundidade || 0,
              // quantidade: prev.especificacoes.quantidade || 0, // Removed
              valorTotalPago: prev.especificacoes.valorTotalPago || 0,
              valorFrete: prev.especificacoes.valorFrete || 0,
              dataCompraEmbalagem: prev.especificacoes.dataCompraEmbalagem || '',
            };
          }
        } else if (value === 'material') {
          newState.unidade = ''; // Will be set by user
          if (!initialData) {
            newState.estoqueAtual = 0;
            newState.estoqueMinimo = 0;
            newState.especificacoes = {
              tipoMaterial: '',
              materialAssociado: '',
              altura: 0,
              largura: 0,
              profundidade: 0,
              // quantidade: 0, // Removed
              valorTotalPago: 0,
              valorFrete: 0,
              dataCompraMaterial: '',
              usarMedidas: true, // Ensure usarMedidas is set for new material insumos
            };
          } else {
            newState.especificacoes = {
              ...prev.especificacoes,
              tipoMaterial: prev.especificacoes.tipoMaterial || '',
              materialAssociado: prev.especificacoes.materialAssociado || '',
              altura: prev.especificacoes.altura || 0,
              largura: prev.especificacoes.largura || 0,
              profundidade: prev.especificacoes.profundidade || 0,
              // quantidade: prev.especificacoes.quantidade || 0, // Removed
              valorTotalPago: prev.especificacoes.valorTotalPago || 0,
              valorFrete: prev.especificacoes.valorFrete || 0,
              dataCompraMaterial: prev.especificacoes.dataCompraMaterial || '',
              usarMedidas: prev.especificacoes.usarMedidas ?? true, // Preserve existing or default to true
            };
          }
        } else { // For 'tempo', 'outros'
          newState.especificacoes = {};
          newState.unidade = '';
          if (!initialData) { // Only reset for new insumos
            newState.estoqueAtual = 0;
            newState.estoqueMinimo = 0;
          }
        }
        // Clear nome when changing type, it will be regenerated by useEffect
        newState.nome = '';
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

    if (name === 'tipoEmbalagem') {
      setShowNewTipoEmbalagemInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, tipoEmbalagem: '' } }));
        return;
      }
    }

    if (name === 'materialEmbalagem') {
      setShowNewMaterialEmbalagemInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, materialEmbalagem: '' } }));
        return;
      }
    }

    if (name === 'tipoMaterial') {
      setShowNewTipoMaterialInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, tipoMaterial: '' } }));
        return;
      }
    }

    if (name === 'materialAssociado') {
      setShowNewMaterialAssociadoInput(value === 'addNew');
      if (value === 'addNew') {
        setFormData(prev => ({ ...prev, especificacoes: { ...prev.especificacoes, materialAssociado: '' } }));
        return;
      }
    }

    if (name === 'autoNumberSpool') {
      setFormData(prev => ({
        ...prev,
        especificacoes: {
          ...prev.especificacoes,
          autoNumberSpool: checked,
          spoolNumero: checked ? 0 : (parseInt(prev.especificacoes.spoolNumero, 10) || 0) // Clear manual number if auto is checked, or keep as number
        }
      }));
      return;
    }

    if (name === 'usarMedidas') {
      setFormData(prev => ({
        ...prev,
        especificacoes: {
          ...prev.especificacoes,
          usarMedidas: checked,
          altura: checked ? (prev.especificacoes.altura || 0) : 0,
          largura: checked ? (prev.especificacoes.largura || 0) : 0,
          profundidade: checked ? (prev.especificacoes.profundidade || 0) : 0,
        }
      }));
      return;
    }
    
    setFormData(prev => {
      let newEspecificacoes = {
        ...prev.especificacoes,
        [name]: type === 'number' ? parseFloat(value) || 0 : (name === 'spoolNumero' ? (parseInt(value, 10) || 0) : (type === 'checkbox' ? checked : value)),
      };

      // Handle pesoBruto and pesoLiquido calculation
      if (name === 'pesoBruto' && newEspecificacoes.aberto) {
        newEspecificacoes.pesoLiquido = (parseFloat(value) || 0) - 130; // Calculate net weight
      } else if (name === 'aberto') {
        if (checked) {
          // When 'aberto' is checked, calculate pesoLiquido based on current pesoBruto
          newEspecificacoes.pesoLiquido = (parseFloat(newEspecificacoes.pesoBruto) || 0) - 130;
        } else {
          // When 'aberto' is unchecked, reset pesoBruto and pesoLiquido
          newEspecificacoes.pesoBruto = 0;
          newEspecificacoes.pesoLiquido = 0;
        }
      }

      // Calculate custoPorUnidade for filaments
      if (formData.tipo === 'filamento' && (name === 'valorPagoPorSpool' || name === 'tamanhoSpool')) {
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

      // Calculate custoPorUnidade for embalagens and materials
      if ((formData.tipo === 'embalagem' || formData.tipo === 'material') && (name === 'valorTotalPago' || name === 'valorFrete' || name === 'quantidade')) {
        const valorTotalPago = parseFloat(newEspecificacoes.valorTotalPago || 0);
        const valorFrete = parseFloat(newEspecificacoes.valorFrete || 0);
        // The quantity for cost calculation should be the totalPosicoes, not from formData.especificacoes.quantidade
        // For material type, custoPorUnidade is calculated based on valorTotalPago + valorFrete divided by totalPosicoes
        if (formData.tipo === 'material' && totalPosicoes > 0) {
          return {
            ...prev,
            especificacoes: newEspecificacoes,
            custoPorUnidade: parseFloat(((valorTotalPago + valorFrete) / totalPosicoes).toFixed(2)), // Cost per unit, rounded to 2 decimal places
          };
        } else if (formData.tipo === 'embalagem' && totalPosicoes > 0) {
          return {
            ...prev,
            especificacoes: newEspecificacoes,
            custoPorUnidade: parseFloat(((valorTotalPago + valorFrete) / totalPosicoes).toFixed(2)), // Cost per unit, rounded to 2 decimal places
          };
        } else {
          return {
            ...prev,
            especificacoes: newEspecificacoes,
            custoPorUnidade: 0, // Reset if quantity is zero
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
      if (!initialData && !formData.especificacoes.autoNumberSpool && (formData.especificacoes.spoolNumero === 0 || isNaN(formData.especificacoes.spoolNumero))) {
        newErrors.spoolNumero = 'Número do Spool é obrigatório e deve ser um número válido quando a numeração automática está desativada.';
      }

      if (formData.especificacoes.aberto && !formData.especificacoes.dataAbertura) newErrors.dataAbertura = 'Data de Abertura é obrigatória.';
      if (formData.especificacoes.aberto && formData.especificacoes.pesoBruto <= 0) newErrors.pesoBruto = 'Peso Bruto deve ser maior que zero.';
      if (formData.especificacoes.aberto && !formData.especificacoes.dataUltimaPesagem) newErrors.dataUltimaPesagem = 'Data da Última Pesagem é obrigatória.';
      if (formData.especificacoes.finalizadoEm && !formData.especificacoes.dataFinalizacao) newErrors.dataFinalizacao = 'Data de Finalização é obrigatória.';
      if (formData.especificacoes.lote && !formData.especificacoes.lote.trim()) newErrors.lote = 'Lote é obrigatório se preenchido.';
      if (formData.especificacoes.dataFabricacao && !formData.especificacoes.dataFabricacao.trim()) newErrors.dataFabricacao = 'Data de Fabricação é obrigatória se preenchida.';
      if (formData.especificacoes.dataCompra && !formData.especificacoes.dataCompra.trim()) newErrors.dataCompra = 'Data de Compra é obrigatória se preenchida.';
    } else if (formData.tipo === 'embalagem') {
      if (!formData.especificacoes.tipoEmbalagem.trim()) newErrors.tipoEmbalagem = 'Tipo de Embalagem é obrigatório.';
      if (!formData.especificacoes.materialEmbalagem.trim()) newErrors.materialEmbalagem = 'Material da Embalagem é obrigatório.';
      if (formData.especificacoes.altura <= 0) newErrors.altura = 'Altura é obrigatória e deve ser maior que zero.';
      if (formData.especificacoes.largura <= 0) newErrors.largura = 'Largura é obrigatória e deve ser maior que zero.';
      if (formData.especificacoes.valorTotalPago <= 0) newErrors.valorTotalPago = 'Valor Total Pago deve ser maior que zero.';
      if (!formData.especificacoes.dataCompraEmbalagem.trim()) newErrors.dataCompraEmbalagem = 'Data da Compra é obrigatória.';
      if (formData.estoqueMinimo < 0) newErrors.estoqueMinimo = 'Estoque mínimo não pode ser negativo.';
      if (totalPosicoes <= 0) {
        newErrors.posicoesEstoque = 'É necessário adicionar pelo menos uma posição de estoque com quantidade maior que zero.';
      }
    } else if (formData.tipo === 'material') {
      if (!formData.especificacoes.tipoMaterial.trim()) newErrors.tipoMaterial = 'Tipo de Material é obrigatório.';
      if (!formData.especificacoes.materialAssociado.trim()) newErrors.materialAssociado = 'Material Associado é obrigatório.';
      if (formData.especificacoes.usarMedidas) {
        if (formData.especificacoes.altura <= 0) newErrors.altura = 'Altura é obrigatória e deve ser maior que zero.';
        if (formData.especificacoes.largura <= 0) newErrors.largura = 'Largura é obrigatória e deve ser maior que zero.';
      }
      if (formData.especificacoes.valorTotalPago <= 0) newErrors.valorTotalPago = 'Valor Total Pago deve ser maior que zero.';
      if (!formData.especificacoes.dataCompraMaterial.trim()) newErrors.dataCompraMaterial = 'Data da Compra é obrigatória.';
      if (!formData.unidade.trim()) newErrors.unidade = 'Unidade é obrigatória.';
      if (formData.custoPorUnidade <= 0) newErrors.custoPorUnidade = 'Custo por unidade deve ser maior que zero.';
      if (formData.estoqueMinimo < 0) newErrors.estoqueMinimo = 'Estoque mínimo não pode ser negativo.';
      if (totalPosicoes <= 0) {
        newErrors.posicoesEstoque = 'É necessário adicionar pelo menos uma posição de estoque com quantidade maior que zero.';
      }
    } else { // For 'tempo', 'outros'
      if (!formData.nome.trim()) newErrors.nome = 'Nome é obrigatório.';
      if (!formData.unidade.trim()) newErrors.unidade = 'Unidade é obrigatória.';
      if (formData.custoPorUnidade <= 0) newErrors.custoPorUnidade = 'Custo por unidade deve ser maior que zero.';
      if (formData.estoqueAtual < 0) newErrors.estoqueAtual = 'Estoque atual não pode ser negativo.';
      if (formData.estoqueMinimo < 0) newErrors.estoqueMinimo = 'Estoque mínimo não pode ser negativo.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      let dataToSave = { ...formData };

      if (initialData?.id) {
        dataToSave.id = initialData.id;
      }

      if (dataToSave.tipo === 'filamento') {
        // ... (lógica de filamento existente)
      } else {
        // Para não-filamentos, o estoque será gerenciado pelas posições de estoque
        dataToSave.estoqueAtual = totalPosicoes; // Update estoqueAtual based on sum of posicoesEstoque
        dataToSave.posicoesEstoque = posicoesEstoque; // Save the positions directly
        // dataToSave.especificacoes.quantidade = totalPosicoes; // Removed as per user request
      }

      // Clean the object to remove any undefined values before sending to Firebase
      dataToSave = cleanObject(dataToSave);

      try {
        await runTransaction(db, async (transaction) => {
          const insumosRef = collection(db, 'insumos');
          let insumoDocRef;
          let insumoId;

          if (initialData?.id) {
            insumoDocRef = doc(insumosRef, initialData.id);
            transaction.update(insumoDocRef, dataToSave);
            insumoId = initialData.id;
          } else {
            insumoDocRef = doc(insumosRef);
            insumoId = insumoDocRef.id;
            transaction.set(insumoDocRef, {
              ...dataToSave,
              id: insumoId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            if (dataToSave.estoqueAtual > 0 && dataToSave.tipo !== 'filamento') {
              const lancamentoInsumoRef = doc(collection(db, 'lancamentosInsumos'));
              // Ensure only required fields are passed for 'locais' array and clean them
              const cleanedPosicoesEstoque = posicoesEstoque.map(pos => cleanObject({
                recipienteId: pos.recipienteId,
                divisao: pos.divisao,
                quantidade: pos.quantidade,
                localId: pos.localId,
              }));
              transaction.set(lancamentoInsumoRef, {
                id: lancamentoInsumoRef.id,
                insumoId: insumoId,
                tipoInsumo: dataToSave.tipo,
                tipoMovimento: 'entrada',
                quantidade: dataToSave.estoqueAtual, // Use estoqueAtual directly
                unidadeMedida: dataToSave.unidade,
                dataLancamento: serverTimestamp(),
                origem: 'cadastro_inicial',
                detalhes: `Estoque inicial de ${dataToSave.nome}`,
                locais: cleanedPosicoesEstoque,
              });
            }
          }
          onSave({ ...dataToSave, id: insumoId });
        });
      } catch (error) {
        console.error("Error saving insumo:", error);
        setErrors(prev => ({ ...prev, submit: `Erro ao salvar: ${error.message}` }));
      }
    }
  };

  // Calculate total quantity from posicoesEstoque
  const totalPosicoes = posicoesEstoque.reduce((sum, pos) => sum + pos.quantidade, 0);

  // Effect to update formData.especificacoes.quantidade and formData.estoqueAtual
  useEffect(() => {
    if (formData.tipo === 'material' || formData.tipo === 'embalagem') {
      setFormData(prev => ({
        ...prev,
        estoqueAtual: totalPosicoes,
        especificacoes: {
          ...prev.especificacoes,
          // quantidade: totalPosicoes, // Removed as per user request
        },
      }));
    }
  }, [totalPosicoes, formData.tipo]);

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
    <div className="fixed inset-0 backdrop-blur-sm overflow-y-auto h-full w-full flex justify-center items-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
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
              <option value="embalagem">Embalagem</option>
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
                readOnly={formData.tipo === 'material' || formData.tipo === 'embalagem'}
                className={`mt-1 block w-full border ${errors.nome ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 ${formData.tipo === 'material' || formData.tipo === 'embalagem' ? 'bg-gray-100 cursor-not-allowed' : ''} focus:ring-blue-500 focus:border-blue-500`}
              />
              {errors.nome && <p className="mt-1 text-sm text-red-600">{errors.nome}</p>}
            </div>
          )}

          {/* Unidade, Custo e Estoque Mínimo (conditionally rendered for non-filament) */}
          {formData.tipo !== 'filamento' && (
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
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
              <div className="col-span-1">
                <label htmlFor="custoPorUnidade" className="block text-sm font-medium text-gray-700">Custo (R$)</label>
                <input
                  type="number"
                  name="custoPorUnidade"
                  id="custoPorUnidade"
                  value={formData.custoPorUnidade}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  readOnly={formData.tipo === 'material'}
                  className={`mt-1 block w-full border ${errors.custoPorUnidade ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 ${formData.tipo === 'material' ? 'bg-gray-100 cursor-not-allowed' : ''} focus:ring-blue-500 focus:border-blue-500`}
                />
                {errors.custoPorUnidade && <p className="mt-1 text-sm text-red-600">{errors.custoPorUnidade}</p>}
              </div>
              <div className="col-span-1">
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

          {/* Estoque Atual e Posições de Estoque (conditionally rendered for non-filament) */}
          {formData.tipo !== 'filamento' && (
            <>

              <div className="mt-4 p-4 border rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-md font-semibold">Posições de Estoque</h4>
                  <button
                    type="button"
                    onClick={() => setIsPositionModalOpen(true)}
                    className="flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Adicionar
                  </button>
                </div>
                {errors.posicoesEstoque && <p className="mt-1 text-sm text-red-600">{errors.posicoesEstoque}</p>}
                <ul className="space-y-2">
                  {posicoesEstoque.map((pos, index) => (
                    <li key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                      <span>
                        <strong>{pos.quantidade}</strong> em {pos.localNome} - {pos.recipienteId} ({pos.divisao.h},{pos.divisao.v})
                      </span>
                      <button
                        type="button"
                        onClick={() => setPosicoesEstoque(prev => prev.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
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
                        {option}
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
                    type="number"
                    name="spoolNumero"
                    id="spoolNumero"
                    value={formData.especificacoes.spoolNumero || 0}
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
                  value={formData.especificacoes.valorPagoPorSpool}
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
                      <label htmlFor="pesoBruto" className="block text-sm font-medium text-gray-700">Peso Bruto (g)</label>
                      <input
                        type="number"
                        name="pesoBruto"
                        id="pesoBruto"
                        value={formData.especificacoes.pesoBruto || 0}
                        onChange={handleEspecificacoesChange}
                        min="0"
                        step="0.01"
                        className={`mt-1 block w-full border ${errors.pesoBruto ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                      />
                      {errors.pesoBruto && <p className="mt-1 text-sm text-red-600">{errors.pesoBruto}</p>}
                    </div>
                    <div>
                      <label htmlFor="pesoLiquido" className="block text-sm font-medium text-gray-700">Peso Líquido (g)</label>
                      <input
                        type="number"
                        name="pesoLiquido"
                        id="pesoLiquido"
                        value={formData.especificacoes.pesoLiquido || 0}
                        readOnly
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-100 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label htmlFor="dataUltimaPesagem" className="block text-sm font-medium text-gray-700">Data da Última Pesagem</label>
                      <input
                        type="date"
                        name="dataUltimaPesagem"
                        id="dataUltimaPesagem"
                        value={formData.especificacoes.dataUltimaPesagem || ''}
                        onChange={handleEspecificacoesChange}
                        className={`mt-1 block w-full border ${errors.dataUltimaPesagem ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                      />
                      {errors.dataUltimaPesagem && <p className="mt-1 text-sm text-red-600">{errors.dataUltimaPesagem}</p>}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="lote" className="block text-sm font-medium text-gray-700">Lote</label>
                  <input
                    type="text"
                    name="lote"
                    id="lote"
                    value={formData.especificacoes.lote || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.lote ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  />
                  {errors.lote && <p className="mt-1 text-sm text-red-600">{errors.lote}</p>}
                </div>
                <div>
                  <label htmlFor="dataFabricacao" className="block text-sm font-medium text-gray-700">Data de Fabricação</label>
                  <input
                    type="date"
                    name="dataFabricacao"
                    id="dataFabricacao"
                    value={formData.especificacoes.dataFabricacao || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.dataFabricacao ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  />
                  {errors.dataFabricacao && <p className="mt-1 text-sm text-red-600">{errors.dataFabricacao}</p>}
                </div>
                <div>
                  <label htmlFor="dataCompra" className="block text-sm font-medium text-gray-700">Data de Compra</label>
                  <input
                    type="date"
                    name="dataCompra"
                    id="dataCompra"
                    value={formData.especificacoes.dataCompra || ''}
                    onChange={handleEspecificacoesChange}
                    className={`mt-1 block w-full border ${errors.dataCompra ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                  />
                  {errors.dataCompra && <p className="mt-1 text-sm text-red-600">{errors.dataCompra}</p>}
                </div>
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
              <div className="space-y-4 mt-1">
                {formData.tipo === 'material' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-3">
                        <label htmlFor="tipoMaterial" className="block text-sm font-medium text-gray-700">Tipo de Material</label>
                        <select
                          name="tipoMaterial"
                          id="tipoMaterial"
                          value={formData.especificacoes.tipoMaterial || ''}
                          onChange={handleEspecificacoesChange}
                          className={`mt-1 block w-full border ${errors.tipoMaterial ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        >
                          <option value="">Selecione o Tipo</option>
                          {initialTiposMaterial.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                          <option value="addNew">Adicionar Novo...</option>
                        </select>
                        {showNewTipoMaterialInput && (
                          <input
                            type="text"
                            name="tipoMaterial"
                            value={formData.especificacoes.tipoMaterial || ''}
                            onChange={handleEspecificacoesChange}
                            placeholder="Novo Tipo de Material"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                        {errors.tipoMaterial && <p className="mt-1 text-sm text-red-600">{errors.tipoMaterial}</p>}
                      </div>
                      <div className="col-span-1">
                        <label htmlFor="materialAssociado" className="block text-sm font-medium text-gray-700">Material</label>
                        <select
                          name="materialAssociado"
                          id="materialAssociado"
                          value={formData.especificacoes.materialAssociado || ''}
                          onChange={handleEspecificacoesChange}
                          className={`mt-1 block w-full border ${errors.materialAssociado ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        >
                          <option value="">Selecione</option>
                          {initialMateriaisAssociados.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                          <option value="addNew">Adicionar Novo...</option>
                        </select>
                        {showNewMaterialAssociadoInput && (
                          <input
                            type="text"
                            name="materialAssociado"
                            value={formData.especificacoes.materialAssociado || ''}
                            onChange={handleEspecificacoesChange}
                            placeholder="Novo Material"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                        {errors.materialAssociado && <p className="mt-1 text-sm text-red-600">{errors.materialAssociado}</p>}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <input
                        id="usarMedidas"
                        name="usarMedidas"
                        type="checkbox"
                        checked={formData.especificacoes.usarMedidas}
                        onChange={handleEspecificacoesChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="usarMedidas" className="ml-2 block text-sm font-medium text-gray-700">
                        Usar Medidas (Altura, Largura, Profundidade)
                      </label>
                    </div>
                    {formData.especificacoes.usarMedidas && (
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label htmlFor="altura" className="block text-sm font-medium text-gray-700">Altura (cm)</label>
                          <input
                            type="number"
                            name="altura"
                            id="altura"
                            value={Number(formData.especificacoes.altura)}
                            onChange={handleEspecificacoesChange}
                            min="0"
                            step="0.01"
                            className={`mt-1 block w-full border ${errors.altura ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                          />
                          {errors.altura && <p className="mt-1 text-sm text-red-600">{errors.altura}</p>}
                        </div>
                        <div>
                          <label htmlFor="largura" className="block text-sm font-medium text-gray-700">Largura (cm)</label>
                          <input
                            type="number"
                            name="largura"
                            id="largura"
                            value={Number(formData.especificacoes.largura)}
                            onChange={handleEspecificacoesChange}
                            min="0"
                            step="0.01"
                            className={`mt-1 block w-full border ${errors.largura ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                          />
                          {errors.largura && <p className="mt-1 text-sm text-red-600">{errors.largura}</p>}
                        </div>
                        <div>
                          <label htmlFor="profundidade" className="block text-sm font-medium text-gray-700">Profundidade (cm)</label>
                          <input
                            type="number"
                            name="profundidade"
                            id="profundidade"
                            value={Number(formData.especificacoes.profundidade)}
                            onChange={handleEspecificacoesChange}
                            min="0"
                            step="0.01"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="valorTotalPago" className="block text-sm font-medium text-gray-700">Valor Total (R$)</label>
                        <input
                          type="number"
                          name="valorTotalPago"
                          id="valorTotalPago"
                          value={formData.especificacoes.valorTotalPago || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className={`mt-1 block w-full border ${errors.valorTotalPago ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                        {errors.valorTotalPago && <p className="mt-1 text-sm text-red-600">{errors.valorTotalPago}</p>}
                      </div>
                      <div>
                        <label htmlFor="valorFrete" className="block text-sm font-medium text-gray-700">Frete (R$)</label>
                        <input
                          type="number"
                          name="valorFrete"
                          id="valorFrete"
                          value={formData.especificacoes.valorFrete || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="dataCompraMaterial" className="block text-sm font-medium text-gray-700">Data da Compra</label>
                        <input
                          type="date"
                          name="dataCompraMaterial"
                          id="dataCompraMaterial"
                          value={formData.especificacoes.dataCompraMaterial || ''}
                          onChange={handleEspecificacoesChange}
                          className={`mt-1 block w-full border ${errors.dataCompraMaterial ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                        {errors.dataCompraMaterial && <p className="mt-1 text-sm text-red-600">{errors.dataCompraMaterial}</p>}
                      </div>
                    </div>
                  </div>
                )}
                {formData.tipo === 'embalagem' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-3">
                        <label htmlFor="tipoEmbalagem" className="block text-sm font-medium text-gray-700">Tipo de Embalagem</label>
                        <select
                          name="tipoEmbalagem"
                          id="tipoEmbalagem"
                          value={formData.especificacoes.tipoEmbalagem || ''}
                          onChange={handleEspecificacoesChange}
                          className={`mt-1 block w-full border ${errors.tipoEmbalagem ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        >
                          <option value="">Selecione o Tipo</option>
                          {initialTiposEmbalagem.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                          <option value="addNew">Adicionar Novo...</option>
                        </select>
                        {showNewTipoEmbalagemInput && (
                          <input
                            type="text"
                            name="tipoEmbalagem"
                            value={formData.especificacoes.tipoEmbalagem || ''}
                            onChange={handleEspecificacoesChange}
                            placeholder="Novo Tipo de Embalagem"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                        {errors.tipoEmbalagem && <p className="mt-1 text-sm text-red-600">{errors.tipoEmbalagem}</p>}
                      </div>
                      <div className="col-span-1">
                        <label htmlFor="materialEmbalagem" className="block text-sm font-medium text-gray-700">Material</label>
                        <select
                          name="materialEmbalagem"
                          id="materialEmbalagem"
                          value={formData.especificacoes.materialEmbalagem || ''}
                          onChange={handleEspecificacoesChange}
                          className={`mt-1 block w-full border ${errors.materialEmbalagem ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        >
                          <option value="">Selecione</option>
                          {initialMateriaisEmbalagem.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                          <option value="addNew">Adicionar Novo...</option>
                        </select>
                        {showNewMaterialEmbalagemInput && (
                          <input
                            type="text"
                            name="materialEmbalagem"
                            value={formData.especificacoes.materialEmbalagem || ''}
                            onChange={handleEspecificacoesChange}
                            placeholder="Novo Material"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                        {errors.materialEmbalagem && <p className="mt-1 text-sm text-red-600">{errors.materialEmbalagem}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label htmlFor="altura" className="block text-sm font-medium text-gray-700">Altura (cm)</label>
                        <input
                          type="number"
                          name="altura"
                          id="altura"
                          value={formData.especificacoes.altura || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className={`mt-1 block w-full border ${errors.altura ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                        {errors.altura && <p className="mt-1 text-sm text-red-600">{errors.altura}</p>}
                      </div>
                      <div>
                        <label htmlFor="largura" className="block text-sm font-medium text-gray-700">Largura (cm)</label>
                        <input
                          type="number"
                          name="largura"
                          id="largura"
                          value={formData.especificacoes.largura || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className={`mt-1 block w-full border ${errors.largura ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                        {errors.largura && <p className="mt-1 text-sm text-red-600">{errors.largura}</p>}
                      </div>
                      <div>
                        <label htmlFor="profundidade" className="block text-sm font-medium text-gray-700">Profundidade (cm)</label>
                        <input
                          type="number"
                          name="profundidade"
                          id="profundidade"
                          value={formData.especificacoes.profundidade || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="quantidade" className="block text-sm font-medium text-gray-700">Quantidade</label>
                        <input
                          type="number"
                          name="quantidade"
                          id="quantidade"
                          value={totalPosicoes} // Display sum of posicoesEstoque
                          readOnly // Make it read-only
                          className={`mt-1 block w-full border ${errors.quantidade ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-100 cursor-not-allowed`}
                        />
                        {errors.quantidade && <p className="mt-1 text-sm text-red-600">{errors.quantidade}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="valorTotalPago" className="block text-sm font-medium text-gray-700">Valor Total (R$)</label>
                        <input
                          type="number"
                          name="valorTotalPago"
                          id="valorTotalPago"
                          value={formData.especificacoes.valorTotalPago || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className={`mt-1 block w-full border ${errors.valorTotalPago ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                        {errors.valorTotalPago && <p className="mt-1 text-sm text-red-600">{errors.valorTotalPago}</p>}
                      </div>
                      <div>
                        <label htmlFor="valorFrete" className="block text-sm font-medium text-gray-700">Frete (R$)</label>
                        <input
                          type="number"
                          name="valorFrete"
                          id="valorFrete"
                          value={formData.especificacoes.valorFrete || 0}
                          onChange={handleEspecificacoesChange}
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="dataCompraEmbalagem" className="block text-sm font-medium text-gray-700">Data da Compra</label>
                        <input
                          type="date"
                          name="dataCompraEmbalagem"
                          id="dataCompraEmbalagem"
                          value={formData.especificacoes.dataCompraEmbalagem || ''}
                          onChange={handleEspecificacoesChange}
                          className={`mt-1 block w-full border ${errors.dataCompraEmbalagem ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                        {errors.dataCompraEmbalagem && <p className="mt-1 text-sm text-red-600">{errors.dataCompraEmbalagem}</p>}
                      </div>
                    </div>
                  </div>
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
            {isPositionModalOpen && (
              <InsumoStockPositionModal
                isOpen={isPositionModalOpen}
                onClose={() => setIsPositionModalOpen(false)}
                onSave={(posicao) => {
                  setPosicoesEstoque(prev => [...prev, posicao]);
                  setIsPositionModalOpen(false);
                }}
              />
            )}
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
