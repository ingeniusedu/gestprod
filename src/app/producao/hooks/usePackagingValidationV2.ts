import { useMemo } from 'react';
import { GrupoMontagem } from '../../types';
import { PackagingData } from './usePackagingStateV2';

export interface PackagingValidationResult {
  allItemsAvailable: boolean;
  allItemsChecked: boolean;
  packagingTimeSet: boolean;
  insumosSelected: boolean;
  canFinish: boolean;
  blockingReason?: string;
}

/**
 * Função para validar se todos os itens de um produto estão disponíveis
 * Percorre recursivamente a hierarquia: Kit → Modelos → Peças
 */
const validateProductAvailability = (produto: any): boolean => {
  // Verifica se o produto principal está atendido
  const isProductFulfilled = (produto.quantidadeAtendida || 0) >= produto.quantidade;
  if (!isProductFulfilled) return false;

  // Verifica modelos do produto
  if (produto.modelos && produto.modelos.length > 0) {
    for (const modelo of produto.modelos) {
      const isModeloFulfilled = (modelo.quantidadeAtendida || 0) >= modelo.quantidade;
      if (!isModeloFulfilled) return false;

      // Verifica peças do modelo
      if (modelo.pecas && modelo.pecas.length > 0) {
        for (const peca of modelo.pecas) {
          const isPecaFulfilled = (peca.quantidadeAtendida || 0) >= peca.quantidade;
          if (!isPecaFulfilled) return false;
        }
      }
    }
  }

  // Verifica peças diretas do produto (sem modelo)
  if (produto.pecas && produto.pecas.length > 0) {
    for (const peca of produto.pecas) {
      const isPecaFulfilled = (peca.quantidadeAtendida || 0) >= peca.quantidade;
      if (!isPecaFulfilled) return false;
    }
  }

  return true;
};

/**
 * Função para contar o número total de itens conferíveis na hierarquia
 */
const countTotalItems = (produtosFinaisNecessarios: any[]): number => {
  let totalItems = 0;

  for (const produto of produtosFinaisNecessarios) {
    totalItems++; // O produto kit em si
    
    // Conta modelos
    if (produto.modelos && produto.modelos.length > 0) {
      for (const modelo of produto.modelos) {
        totalItems++; // O modelo
        
        // Conta peças do modelo
        if (modelo.pecas && modelo.pecas.length > 0) {
          totalItems += modelo.pecas.length;
        }
      }
    }

    // Conta peças diretas
    if (produto.pecas && produto.pecas.length > 0) {
      totalItems += produto.pecas.length;
    }
  }

  return totalItems;
};

/**
 * Função para gerar IDs esperados para os checkboxes
 */
const generateExpectedItemIds = (produtosFinaisNecessarios: any[]): string[] => {
  const itemIds: string[] = [];

  for (const produto of produtosFinaisNecessarios) {
    itemIds.push(`kit_${produto.produtoId}`);
    
    // IDs dos modelos
    if (produto.modelos && produto.modelos.length > 0) {
      for (const modelo of produto.modelos) {
        itemIds.push(`modelo_${modelo.modeloId}`);
        
        // IDs das peças do modelo
        if (modelo.pecas && modelo.pecas.length > 0) {
          for (const peca of modelo.pecas) {
            itemIds.push(`peca_${peca.pecaId}`);
          }
        }
      }
    }

    // IDs das peças diretas
    if (produto.pecas && produto.pecas.length > 0) {
      for (const peca of produto.pecas) {
        itemIds.push(`peca_${peca.pecaId}`);
      }
    }
  }

  return itemIds;
};

export const usePackagingValidationV2 = (
  assemblyGroupId: string, 
  packagingData?: PackagingData,
  assemblyGroup?: GrupoMontagem
): PackagingValidationResult => {
  const validations = useMemo(() => {
    // Default values if no data
    if (!packagingData) {
      return {
        allItemsAvailable: false,
        allItemsChecked: false,
        packagingTimeSet: false,
        insumosSelected: false,
        canFinish: false,
        blockingReason: 'Embalagem não iniciada'
      };
    }

    // Check if packaging is started
    if (packagingData.status !== 'started') {
      return {
        allItemsAvailable: false,
        allItemsChecked: false,
        packagingTimeSet: false,
        insumosSelected: false,
        canFinish: false,
        blockingReason: 'Embalagem não iniciada'
      };
    }

    // Check if all items are available based on real hierarchy data
    let allItemsAvailable = true;
    if (assemblyGroup?.produtosFinaisNecessarios) {
      for (const produto of assemblyGroup.produtosFinaisNecessarios) {
        if (!validateProductAvailability(produto)) {
          allItemsAvailable = false;
          break;
        }
      }
    } else {
      allItemsAvailable = false;
    }

    // Check if all items are checked based on expected items from hierarchy
    let allItemsChecked = false;
    if (assemblyGroup?.produtosFinaisNecessarios) {
      const expectedItemIds = generateExpectedItemIds(assemblyGroup.produtosFinaisNecessarios);
      const checkedItems = packagingData.checkedItems || {};
      
      const totalExpectedItems = expectedItemIds.length;
      const totalCheckedItems = expectedItemIds.filter(itemId => checkedItems[itemId] === true).length;
      
      allItemsChecked = totalCheckedItems === totalExpectedItems && totalExpectedItems > 0;
    }

    // Check if packaging time is set
    const packagingTimeSet = packagingData.packagingTimeMinutes > 0;

    // Check if insumos are selected
    const insumosSelected = packagingData.selectedInsumos && packagingData.selectedInsumos.length > 0;

    // Determine if can finish
    const canFinish = allItemsAvailable && allItemsChecked && packagingTimeSet && insumosSelected;

    // Determine blocking reason
    let blockingReason: string | undefined;
    if (!canFinish) {
      if (!allItemsAvailable) blockingReason = 'Itens não disponíveis em estoque';
      else if (!allItemsChecked) blockingReason = 'Nem todos os itens foram conferidos';
      else if (!packagingTimeSet) blockingReason = 'Tempo de embalagem não registrado';
      else if (!insumosSelected) blockingReason = 'Nenhum insumo de embalagem selecionado';
    }

    return {
      allItemsAvailable,
      allItemsChecked,
      packagingTimeSet,
      insumosSelected,
      canFinish,
      blockingReason
    };

  }, [assemblyGroupId, packagingData, assemblyGroup]);

  return validations;
};
