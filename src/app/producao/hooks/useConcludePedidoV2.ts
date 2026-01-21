import { useState } from 'react';
import { doc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { GrupoMontagem } from '../../types';
import { PackagingData } from './usePackagingStateV2';
import { 
  gerarDocumentosConclusaoPedido, 
  validarDadosEmbalagem,
  ConcludePedidoV2Data 
} from '../utils/packagingUtilsV2';

interface UseConcludePedidoV2Return {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  concludePedidoV2: (data: ConcludePedidoV2Data) => Promise<void>;
  reset: () => void;
}

export const useConcludePedidoV2 = (): UseConcludePedidoV2Return => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const concludePedidoV2 = async (data: ConcludePedidoV2Data) => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { assemblyGroup, packagingData, user } = data;

      // Validar dados de embalagem
      const validation = validarDadosEmbalagem(packagingData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join('; '));
      }

      // Gerar documentos
      const { productionDocument } = gerarDocumentosConclusaoPedido(data);

      // Criar apenas o documento centralizado na coleção lancamentosProducao
      const productionRef = doc(collection(db, 'lancamentosProducao'));
      await setDoc(productionRef, productionDocument);

      setSuccess(true);
      console.log('Pedido concluído com sucesso (documento centralizado):', {
        productionDocumentId: productionRef.id,
        tipoEvento: productionDocument.tipoEvento,
        payloadKeys: Object.keys(productionDocument.payload)
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao concluir pedido';
      setError(errorMessage);
      console.error('Erro ao concluir pedido V2:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setIsLoading(false);
    setError(null);
    setSuccess(false);
  };

  return {
    isLoading,
    error,
    success,
    concludePedidoV2,
    reset
  };
};
