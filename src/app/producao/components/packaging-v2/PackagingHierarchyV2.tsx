"use client";

import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Package, FileText, Wrench } from 'lucide-react';
import { GrupoMontagem, ProdutoFinalNecessario, PackagingModelo, PackagingPeca } from '../../../types';
import { useExpansionContext } from '../../../contexts/ExpansionContext';

interface PackagingHierarchyV2Props {
  assemblyGroup: GrupoMontagem;
  checkedItems: Record<string, boolean>;
  onToggleItem: (itemId: string, checked: boolean) => void;
}

interface HierarchyItemProps {
  itemId: string;
  itemName: string;
  quantity: number;
  attendedQuantity: number;
  stockQuantity: number;
  isChecked: boolean;
  isFulfilled: boolean;
  onToggle: (checked: boolean) => void;
  children?: React.ReactNode;
  level: number;
  itemType: 'kit' | 'modelo' | 'peca';
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const HierarchyItem: React.FC<HierarchyItemProps> = ({
  itemId,
  itemName,
  quantity,
  attendedQuantity,
  stockQuantity,
  isChecked,
  isFulfilled,
  onToggle,
  children,
  level,
  itemType,
  isExpanded,
  onToggleExpand
}) => {
  const handleToggle = () => {
    onToggle(!isChecked);
  };

  const getIcon = () => {
    switch (itemType) {
      case 'kit':
        return <Package className="h-4 w-4" />;
      case 'modelo':
        return <FileText className="h-4 w-4" />;
      case 'peca':
        return <Wrench className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    if (isFulfilled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ✓ OK
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          ✗ Pendente
        </span>
      );
    }
  };

  const getItemIcon = () => {
    const iconColor = isFulfilled ? 'text-green-600' : 'text-red-600';
    return (
      <div className={iconColor}>
        {getIcon()}
      </div>
    );
  };

  const indentClass = level === 0 ? '' : `ml-${Math.min(level * 6, 24)}`;
  const borderClass = level === 0 ? '' : 'border-l-2 border-gray-200';

  return (
    <div className={`${indentClass} ${borderClass} ${level > 0 ? 'pl-4' : ''}`}>
      <div className={`mb-3 rounded-lg border transition-all duration-200 ${
        isFulfilled 
          ? 'bg-white border-green-200 hover:shadow-sm' 
          : 'bg-red-50 border-red-200 hover:shadow-sm'
      }`}>
        <div className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center flex-1">
              <input
                type="checkbox"
                className="form-checkbox h-4 w-4 text-blue-600 mr-3"
                checked={isChecked}
                onChange={handleToggle}
              />
              <div className="mr-3">
                {getItemIcon()}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${
                  isFulfilled ? 'text-gray-900' : 'text-red-900'
                }`}>
                  {itemName}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {getStatusBadge()}
              {children && (
                <button
                  onClick={onToggleExpand}
                  className={`p-1.5 rounded-md transition-colors ${
                    isFulfilled 
                      ? 'text-green-600 hover:bg-green-100' 
                      : 'text-red-600 hover:bg-red-100'
                  }`}
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>
                Quantidade: <span className="font-medium">{quantity}</span>
              </span>
              <span>
                Atendido: <span className={`font-medium ${isFulfilled ? 'text-green-600' : 'text-red-600'}`}>{attendedQuantity}</span>
              </span>
              <span>
                Estoque: <span className="font-medium">{stockQuantity}</span>
              </span>
            </div>
          </div>
        </div>

        {isExpanded && children && (
          <div className="px-3 pb-3">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

const PackagingHierarchyV2: React.FC<PackagingHierarchyV2Props> = ({ assemblyGroup, checkedItems, onToggleItem }) => {
  // Usar ExpansionContext global em vez de estado local
  const { toggleNode, getExpandedNodes } = useExpansionContext();
  
  // Usar assemblyGroup.id como pedidoId para o contexto
  const pedidoId = assemblyGroup.id || '';
  const expandedNodes = getExpandedNodes(pedidoId);

  const toggleExpanded = (itemId: string) => {
    toggleNode(pedidoId, itemId);
  };

  const hierarchyItems = useMemo(() => {
    if (!assemblyGroup.produtosFinaisNecessarios) {
      return [];
    }

    return assemblyGroup.produtosFinaisNecessarios.map((produto: any) => {
      const itemId = `kit_${produto.produtoId}`;
      const isChecked = checkedItems[itemId] || false;
      const isFulfilled = (produto.quantidadeAtendida || 0) >= produto.quantidade;
      
      // Process modelos do kit
      const modeloChildren = produto.modelos?.map((modelo: PackagingModelo) => {
        const modeloItemId = `modelo_${modelo.modeloId}`;
        const modeloIsChecked = checkedItems[modeloItemId] || false;
        const modeloIsFulfilled = (modelo.quantidadeAtendida || 0) >= modelo.quantidade;
        
        // Process peças do modelo
        const pecaChildren = modelo.pecas?.map((peca: PackagingPeca) => {
          const pecaItemId = `peca_${peca.pecaId}`;
          const pecaIsChecked = checkedItems[pecaItemId] || false;
          const pecaIsFulfilled = (peca.quantidadeAtendida || 0) >= peca.quantidade;
          
          return {
            type: 'peca' as const,
            itemId: pecaItemId,
            nome: peca.nome,
            quantidade: peca.quantidade,
            quantidadeAtendida: peca.quantidadeAtendida || 0,
            estoqueAtual: peca.estoqueAtual || 0,
            isChecked: pecaIsChecked,
            isFulfilled: pecaIsFulfilled,
            children: []
          };
        }) || [];
        
        return {
          type: 'modelo' as const,
          itemId: modeloItemId,
          nome: modelo.nome,
          quantidade: modelo.quantidade,
          quantidadeAtendida: modelo.quantidadeAtendida || 0,
          estoqueAtual: modelo.estoqueAtual || 0,
          isChecked: modeloIsChecked,
          isFulfilled: modeloIsFulfilled,
          children: pecaChildren
        };
      }) || [];

      // Process peças diretas do kit (sem modelo)
      const pecaDiretasChildren = produto.pecas?.map((peca: PackagingPeca) => {
        const pecaItemId = `peca_${peca.pecaId}`;
        const pecaIsChecked = checkedItems[pecaItemId] || false;
        const pecaIsFulfilled = (peca.quantidadeAtendida || 0) >= peca.quantidade;
        
        return {
          type: 'peca' as const,
          itemId: pecaItemId,
          nome: peca.nome,
          quantidade: peca.quantidade,
          quantidadeAtendida: peca.quantidadeAtendida || 0,
          estoqueAtual: peca.estoqueAtual || 0,
          isChecked: pecaIsChecked,
          isFulfilled: pecaIsFulfilled,
          children: []
        };
      }) || [];

      const allChildren = [...modeloChildren, ...pecaDiretasChildren];
      
      return {
        type: 'kit' as const,
        itemId,
        nome: produto.nome,
        quantidade: produto.quantidade,
        quantidadeAtendida: produto.quantidadeAtendida || 0,
        estoqueAtual: produto.estoqueAtual || 0,
        isChecked,
        isFulfilled,
        children: allChildren
      };
    });
  }, [assemblyGroup.produtosFinaisNecessarios, checkedItems]);

  const renderItem = (item: any, level: number = 0) => {
    const { itemId, nome, quantidade, quantidadeAtendida, estoqueAtual, isChecked, isFulfilled, children, type } = item;
    
    return (
      <HierarchyItem
        key={itemId}
        itemId={itemId}
        itemName={nome}
        quantity={quantidade}
        attendedQuantity={quantidadeAtendida}
        stockQuantity={estoqueAtual}
        isChecked={isChecked}
        isFulfilled={isFulfilled}
        onToggle={(checked) => onToggleItem(itemId, checked)}
        children={children && children.length > 0 ? children.map((child: any) => renderItem(child, level + 1)) : undefined}
        level={level}
        itemType={type}
        isExpanded={expandedNodes.has(itemId)}
        onToggleExpand={() => toggleExpanded(itemId)}
      />
    );
  };

  return (
    <div className="space-y-2">
      <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <Package className="h-5 w-5 mr-2" />
        Estrutura do Pedido:
      </h4>
      {hierarchyItems.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhum produto encontrado neste pedido.</p>
        </div>
      ) : (
        hierarchyItems.map((item) => renderItem(item))
      )}
    </div>
  );
};

export default PackagingHierarchyV2;
