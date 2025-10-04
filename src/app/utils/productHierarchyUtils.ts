import { db } from '../services/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { Kit, Modelo, Peca, Parte, GrupoImpressao, PecaInsumo } from '../types';

// Helper to fetch a single document
const fetchDocument = async <T>(collectionName: string, id: string): Promise<T | null> => {
  if (!id) return null;
  const docRef = doc(db, collectionName, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as T;
  }
  return null;
};

// Helper to fetch multiple documents by IDs
const fetchDocumentsByIds = async <T>(collectionName: string, ids: string[]): Promise<T[]> => {
  if (ids.length === 0) return [];
  const docsPromises = ids.map(id => fetchDocument<T>(collectionName, id));
  const results = await Promise.all(docsPromises);
  return results.filter(Boolean) as T[];
};

export interface EnrichedParte extends Parte {
  // Add any additional fields needed for display or editing
}

export interface EnrichedPeca extends Peca {
  partesDetalhes?: EnrichedParte[];
  // Add any additional fields needed for display or editing
}

export interface EnrichedModelo extends Modelo {
  pecasDetalhes?: EnrichedPeca[];
  // Add any additional fields needed for display or editing
}

export interface EnrichedKit extends Kit {
  modelosDetalhes?: EnrichedModelo[];
  pecasDetalhes?: EnrichedPeca[]; // Added for direct peca components in a Kit
  // Add any additional fields needed for display or editing
}

export type EnrichedProduct = EnrichedKit | EnrichedModelo | EnrichedPeca | EnrichedParte;

export const getProductHierarchy = async (
  productId: string,
  productType: 'kit' | 'modelo' | 'peca' | 'parte'
): Promise<EnrichedProduct | null> => {
  if (!productId || !productType) return null;

  if (productType === 'kit') {
    const kit = await fetchDocument<Kit>('kits', productId);
    if (!kit) return null;

    const enrichedKit: EnrichedKit = { ...kit };

    if (kit.componentes && kit.componentes.length > 0) {
      const modeloComponents = kit.componentes.filter((c: { tipo: string; }) => c.tipo === 'modelo');
      const pecaComponents = kit.componentes.filter((c: { tipo: string; }) => c.tipo === 'peca');

      if (modeloComponents.length > 0) {
        const modeloIds = modeloComponents.map((m: { id: string; }) => m.id);
        const modelos = await fetchDocumentsByIds<Modelo>('modelos', modeloIds);

        enrichedKit.modelosDetalhes = await Promise.all(
          modelos.map(async (modelo) => {
            const enrichedModelo: EnrichedModelo = { ...modelo };
            if (modelo.pecas && modelo.pecas.length > 0) {
              const pecaIds = modelo.pecas.map((p: { pecaId: string; }) => p.pecaId);
              const pecas = await fetchDocumentsByIds<Peca>('pecas', pecaIds);

              enrichedModelo.pecasDetalhes = await Promise.all(
                pecas.map(async (peca) => {
                  const enrichedPeca: EnrichedPeca = { ...peca };
                  if (peca.gruposImpressao && peca.gruposImpressao.length > 0) {
                    const allParteIds = peca.gruposImpressao.flatMap(grupo =>
                      grupo.partes?.map(parte => parte.parteId) || []
                    );
                    const partes = await fetchDocumentsByIds<Parte>('partes', allParteIds);
                    enrichedPeca.partesDetalhes = partes.map(parte => ({ ...parte }));
                  }
                  return enrichedPeca;
                })
              );
            }
            return enrichedModelo;
          })
        );
      }

      if (pecaComponents.length > 0) {
        const pecaIds = pecaComponents.map(p => p.id);
        const pecas = await fetchDocumentsByIds<Peca>('pecas', pecaIds);

        enrichedKit.pecasDetalhes = await Promise.all(
          pecas.map(async (peca) => {
            const enrichedPeca: EnrichedPeca = { ...peca };
            if (peca.gruposImpressao && peca.gruposImpressao.length > 0) {
              const allParteIds = peca.gruposImpressao.flatMap(grupo =>
                grupo.partes?.map(parte => parte.parteId) || []
              );
              const partes = await fetchDocumentsByIds<Parte>('partes', allParteIds);
              enrichedPeca.partesDetalhes = partes.map(parte => ({ ...parte }));
            }
            return enrichedPeca;
          })
        );
      }
    }
    return enrichedKit;
  } else if (productType === 'modelo') {
    const modelo = await fetchDocument<Modelo>('modelos', productId);
    if (!modelo) return null;

    const enrichedModelo: EnrichedModelo = { ...modelo };
    if (modelo.pecas && modelo.pecas.length > 0) {
      const pecaIds = modelo.pecas.map(p => p.pecaId);
      const pecas = await fetchDocumentsByIds<Peca>('pecas', pecaIds);

      enrichedModelo.pecasDetalhes = await Promise.all(
        pecas.map(async (peca) => {
          const enrichedPeca: EnrichedPeca = { ...peca };
          if (peca.gruposImpressao && peca.gruposImpressao.length > 0) {
            const allParteIds = peca.gruposImpressao.flatMap(grupo =>
              grupo.partes?.map(parte => parte.parteId) || []
            );
            const partes = await fetchDocumentsByIds<Parte>('partes', allParteIds);
            enrichedPeca.partesDetalhes = partes.map(parte => ({ ...parte }));
          }
          return enrichedPeca;
        })
      );
    }
    return enrichedModelo;
  } else if (productType === 'peca') {
    const peca = await fetchDocument<Peca>('pecas', productId);
    if (!peca) return null;

    const enrichedPeca: EnrichedPeca = { ...peca };
    if (peca.gruposImpressao && peca.gruposImpressao.length > 0) {
      const allParteIds = peca.gruposImpressao.flatMap(grupo =>
        grupo.partes?.map(parte => parte.parteId) || []
      );
      const partes = await fetchDocumentsByIds<Parte>('partes', allParteIds);
      enrichedPeca.partesDetalhes = partes.map(parte => ({ ...parte }));
    }
    return enrichedPeca;
  } else if (productType === 'parte') {
    const parte = await fetchDocument<Parte>('partes', productId);
    if (!parte) return null;
    return { ...parte } as EnrichedParte;
  }

  return null;
};
