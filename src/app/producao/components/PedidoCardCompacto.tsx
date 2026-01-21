import React from 'react';
import { CheckCircle, Clock, AlertCircle, Package, Box, Square } from 'lucide-react';
import { Pedido } from '../../types';

interface PedidoCardCompactoProps {
  pedido: Pedido;
  isSelected: boolean;
  onClick: () => void;
}

export const PedidoCardCompacto: React.FC<PedidoCardCompactoProps> = ({
  pedido,
  isSelected,
  onClick
}) => {
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'concluido':
      case 'finalizado':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'em_producao':
      case 'em_andamento':
        return <Clock className="h-3 w-3 text-blue-600" />;
      case 'aguardando':
      case 'pendente':
        return <AlertCircle className="h-3 w-3 text-yellow-600" />;
      default:
        return <Clock className="h-3 w-3 text-gray-600" />;
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
  const dataFormatada = pedido.dataCriacao?.toDate?.().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  }) || 'N/A';

  return (
    <div
      onClick={onClick}
      className={`p-2 border rounded cursor-pointer transition-all hover:shadow-sm ${
        isSelected 
          ? 'bg-blue-50 border-blue-400 shadow-sm' 
          : 'bg-white border-gray-200 hover:border-blue-300'
      }`}
    >
      {/* Linha 1: Número + Status */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-1">
          <span className="font-bold text-sm text-gray-900">Pedido #{pedido.numero}</span>
        </div>
        <div className={`px-1 py-0.5 rounded text-xs font-semibold ${getStatusColor(pedido.status)}`}>
          <div className="flex items-center space-x-1">
            {getStatusIcon(pedido.status)}
            <span className="text-xs">
              {pedido.status === 'concluido' || pedido.status === 'finalizado' ? 'OK' :
               pedido.status === 'em_producao' || pedido.status === 'em_andamento' ? 'PROD' :
               pedido.status === 'aguardando' || pedido.status === 'pendente' ? 'AG' : pedido.status}
            </span>
          </div>
        </div>
      </div>

      {/* Linha 2: Quantidades de produtos */}
      <div className="flex items-center space-x-3 mb-1 text-xs text-gray-600">
        {tipoCounts.kits > 0 && (
          <div className="flex items-center space-x-1">
            <Package className="h-3 w-3 text-purple-600" />
            <span>{tipoCounts.kits} kit{tipoCounts.kits !== 1 ? 's' : ''}</span>
          </div>
        )}
        {tipoCounts.modelos > 0 && (
          <div className="flex items-center space-x-1">
            <Box className="h-3 w-3 text-blue-600" />
            <span>{tipoCounts.modelos} modelo{tipoCounts.modelos !== 1 ? 's' : ''}</span>
          </div>
        )}
        {tipoCounts.pecas > 0 && (
          <div className="flex items-center space-x-1">
            <Square className="h-3 w-3 text-green-600" />
            <span>{tipoCounts.pecas} peça{tipoCounts.pecas !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Linha 3: Data de criação */}
      <div className="text-xs text-gray-500">
        {dataFormatada}
      </div>
    </div>
  );
};
