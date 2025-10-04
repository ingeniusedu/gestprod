import React, { useState } from 'react';
import { Package, CheckCircle, XCircle, Box, Component, Puzzle, ArrowRightCircle, ChevronUp, ChevronDown } from 'lucide-react';

import { SummaryItem } from '../types'; // Import from types/index.ts

interface ProductionSummaryTableProps {
  summary: SummaryItem[];
  isLoading: boolean;
  onUseStock: (item: SummaryItem) => void;
}

const ProductionSummaryTable: React.FC<ProductionSummaryTableProps> = ({ summary, isLoading, onUseStock }) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (documentId: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [documentId]: !prev[documentId],
    }));
  };

  const renderSummaryRow = (item: SummaryItem) => {
    const isExpanded = expandedRows[item.documentId];
    const hasChildren = item.children && item.children.length > 0;
    const indentation = (item.level || 0) * 20; // 20px per level

    return (
      <React.Fragment key={item.documentId}>
        <tr className="hover:bg-gray-50">
          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500" style={{ paddingLeft: `${indentation + 24}px` }}>
            {hasChildren && (
              <button onClick={() => toggleRow(item.documentId)} className="mr-2 focus:outline-none">
                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
            )}
            {item.sku}
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
            {item.produtoNome}
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
            {item.tipo === 'kit' && <Package className="h-5 w-5 text-gray-500" />}
            {item.tipo === 'modelo' && <Box className="h-5 w-5 text-gray-500" />}
            {item.tipo === 'peca' && <Component className="h-5 w-5 text-gray-500" />}
            {item.tipo === 'parte' && <Puzzle className="h-5 w-5 text-gray-500" />}
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.necessario}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <div className="flex items-center">
              {item.emEstoque}
              <button
                onClick={() => onUseStock(item)}
                className="ml-2 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                title="Usar Estoque"
              >
                <ArrowRightCircle
                  className={`h-5 w-5 ${
                    item.emEstoque >= item.necessario && item.necessario > 0
                      ? 'text-green-500'
                      : item.emEstoque > 0 && item.emEstoque < item.necessario
                      ? 'text-yellow-500'
                      : 'text-gray-400'
                  }`}
                />
              </button>
            </div>
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.aguardando}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.emProducao}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.emMontagemPeca}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.emMontagemModelo}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.emMontagemKit}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.processandoEmbalagem}</td>
          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.finalizado}</td>
        </tr>
        {isExpanded && hasChildren && item.children?.map(child => renderSummaryRow(child))}
      </React.Fragment>
    );
  };

  if (isLoading) {
    return <div>Carregando resumo da produção...</div>;
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Resumo da Lista de Produção</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Produto
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Qte
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estq.
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Aguard.
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prod.
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mont. Peça
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mont. Mod.
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mont. Kit
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Embal.
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Final.
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {summary.length > 0 ? (
              summary.map(item => renderSummaryRow(item))
            ) : (
              <tr>
                <td colSpan={12} className="text-center py-4 text-sm text-gray-500">
                  Nenhum item na lista de produção.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductionSummaryTable;
