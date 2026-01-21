import React from 'react';
import { Package, Box, Square, Layers, ChevronRight, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Pedido } from '../../types';

interface PedidoCardProps {
  pedido: Pedido;
  isSelected: boolean;
  onClick: () => void;
  progresso?: {
    totalProdutos: number;
    produtosAtendidos: number;
    progressoPercentual: number;
  };
}

export const PedidoCard: React.FC<PedidoCardProps> = ({
  pedido,
  isSelected,
  onClick,
  progresso
}) => {
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'concluido':
      case 'finalizado':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'em_producao':
      case 'em_andamento':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'aguardando':
      case 'pendente':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'concluido':
      case 'finalizado':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'em_producao':
      case 'em_andamento':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'aguardando':
      case 'pendente':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status.toLowerCase()) {
      case 'concluido':
      case 'finalizado':
        return 'Concluído';
      case 'em_producao':
      case 'em_andamento':
        return 'Em Produção';
      case 'aguardando':
      case 'pendente':
        return 'Aguardando';
      default:
        return status;
    }
  };

  const getIconForTipo = (tipo: string) => {
    switch (tipo) {
      case 'kit':
        return <Package className="h-4 w-4" />;
      case 'modelo':
        return <Box className="h-4 w-4" />;
      case 'peca':
        return <Square className="h-4 w-4" />;
      default:
        return <Layers className="h-4 w-4" />;
    }
  };

  const countByType = () => {
    const counts = { kits: 0, modelos: 0, pecas: 0 };
    
    pedido.produtos.forEach(produto => {
      if (produto.tipo === 'kit') counts.kits++;
      else if (produto.tipo === 'modelo') counts.modelos++;
      else if (produto.tipo === 'peca') counts.pecas++;
    });

    return counts;
  };

  const tipoCounts = countByType();
  const totalProdutos = pedido.produtos.length;
  const dataFormatada = pedido.dataCriacao?.toDate?.().toLocaleDateString('pt-BR') || 'N/A';

  return (
    <div
      onClick={onClick}
      className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
        isSelected 
          ? 'bg-blue-50 border-blue-400 shadow-sm' 
          : 'bg-white border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <h3 className="font-bold text-lg text-gray-900">Pedido #{pedido.numero}</h3>
            <div className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(pedido.status)}`}>
              <div className="flex items-center space-x-1">
                {getStatusIcon(pedido.status)}
                <span>{getStatusText(pedido.status)}</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600">Criado em: {dataFormatada}</p>
        </div>
        
        <ChevronRight className={`h-5 w-5 transition-transform ${
          isSelected ? 'text-blue-600 rotate-90' : 'text-gray-400'
        }`} />
      </div>

      {/* Contadores de tipos de produtos */}
      <div className="flex items-center space-x-4 mb-3">
        {tipoCounts.kits > 0 && (
          <div className="flex items-center space-x-1 text-sm">
            <Package className="h-4 w-4 text-purple-600" />
            <span className="text-gray-700">{tipoCounts.kits} kit{tipoCounts.kits !== 1 ? 's' : ''}</span>
          </div>
        )}
        {tipoCounts.modelos > 0 && (
          <div className="flex items-center space-x-1 text-sm">
            <Box className="h-4 w-4 text-blue-600" />
            <span className="text-gray-700">{tipoCounts.modelos} modelo{tipoCounts.modelos !== 1 ? 's' : ''}</span>
          </div>
        )}
        {tipoCounts.pecas > 0 && (
          <div className="flex items-center space-x-1 text-sm">
            <Square className="h-4 w-4 text-green-600" />
            <span className="text-gray-700">{tipoCounts.pecas} peça{tipoCounts.pecas !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Barra de progresso */}
      {progresso && (
        <div className="mb-3">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progresso</span>
            <span>{progresso.produtosAtendidos}/{progresso.totalProdutos} produtos</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progresso.progressoPercentual}%` }}
            />
          </div>
        </div>
      )}

      {/* Resumo de produtos */}
      <div className="space-y-2">
        {pedido.produtos.slice(0, 3).map((produto, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              {getIconForTipo(produto.tipo)}
              <span className="text-gray-700 truncate max-w-[180px]">{produto.nomeProduto}</span>
            </div>
            <span className="text-gray-600 font-medium">x{produto.quantidade}</span>
          </div>
        ))}
        
        {pedido.produtos.length > 3 && (
          <div className="text-sm text-gray-500 text-center">
            +{pedido.produtos.length - 3} mais produto{pedido.produtos.length - 3 !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Indicador de seleção */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="text-xs text-blue-600 font-medium flex items-center justify-center">
            <ChevronRight className="h-3 w-3 mr-1" />
            Selecionado para gestão de estoque
          </div>
        </div>
      )}
    </div>
  );
};
