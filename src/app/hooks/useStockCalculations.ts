import { useCallback } from 'react';
import { PosicaoEstoque, LocalProduto, LocalInsumo, Recipiente } from '../types/mapaEstoque';
import { Peca, Parte, Insumo, Modelo, Kit, GrupoDeFilamento } from '../types';

export const useStockCalculations = () => {
  const enrichPosicoesEstoque = useCallback(
    (
      positions: PosicaoEstoque[] | undefined,
      type: 'produto' | 'insumo',
      allLocaisProdutosData: LocalProduto[],
      allLocaisInsumosData: LocalInsumo[],
      allRecipientesData: Recipiente[]
    ): PosicaoEstoque[] => {
      if (!positions) return [];
      return positions.map(pos => {
        const recipiente = allRecipientesData.find(r => r.id === pos.recipienteId);
        if (!recipiente) {
          return pos; // Return original position if recipient not found
        }
        let local;
        if (type === 'produto') {
          local = allLocaisProdutosData.find(l => l.id === recipiente.localEstoqueId);
        } else {
          local = allLocaisInsumosData.find(l => l.id === recipiente.localEstoqueId);
        }
        if (!local) {
        }
        return {
          ...pos,
          localId: recipiente.localEstoqueId,
          localNome: local?.nome || 'N/A',
          posicaoNaGrade: recipiente.posicaoNaGrade
        };
      });
    },
    []
  );

  const getStockForProduct = useCallback(
    (
      productId: string,
      productType: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo',
      allPecasData: Peca[],
      allPartesData: Parte[],
      allInsumosData: Insumo[],
      allModelsData: Modelo[],
      allKitsData: Kit[],
      allFilamentGroupsData: GrupoDeFilamento[],
      allLocaisProdutosData: LocalProduto[],
      allLocaisInsumosData: LocalInsumo[],
      allRecipientesData: Recipiente[]
    ): { estoqueTotal: number; posicoesEstoque: PosicaoEstoque[] } => {


      let estoqueTotal = 0;
      let posicoesEstoque: PosicaoEstoque[] = [];
      
      const calculateStockFromPositions = (positions: PosicaoEstoque[]): number => {
          if (!positions) return 0;
          return positions.reduce((acc, pos) => acc + (pos.quantidade || 0), 0);
      };

      let product: any = null;

      if (productType === 'parte') {
        product = allPartesData.find(p => p.id === productId);
        if (product) {
          posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
          estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
        }
      } else if (productType === 'insumo') {
        const filamentGroup = allFilamentGroupsData.find(fg => fg.id === productId);
        if (filamentGroup) {
          estoqueTotal = filamentGroup.estoqueTotalGramas ?? 0;
          posicoesEstoque = [];
        } else {
          const insumo = allInsumosData.find(i => i.id === productId);
          if (insumo) {
            posicoesEstoque = enrichPosicoesEstoque(insumo.posicoesEstoque || [], 'insumo', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
            estoqueTotal = (insumo as any).estoqueAtual ?? insumo.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
          }
        }
      } else if (productType === 'peca') {
        product = allPecasData.find(p => p.id === productId);
        if (product) {
          posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
          estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
        }
      } else if (productType === 'modelo') {
        product = allModelsData.find(m => m.id === productId);
        if (product) {
          posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
          estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
        }
      } else if (productType === 'kit') {
        product = allKitsData.find(k => k.id === productId);
        if (product) {
          posicoesEstoque = enrichPosicoesEstoque(product.posicoesEstoque || [], 'produto', allLocaisProdutosData, allLocaisInsumosData, allRecipientesData);
          estoqueTotal = product.estoqueTotal ?? calculateStockFromPositions(posicoesEstoque);
        }
      }

      return { estoqueTotal, posicoesEstoque };
    },
    [enrichPosicoesEstoque]
  );

  return { enrichPosicoesEstoque, getStockForProduct };
};
