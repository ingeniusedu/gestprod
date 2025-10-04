import { useEffect, useState } from 'react';
import { collection, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Phase A: Real-time reads forPedidos and GruposMontagem.
 * - Listens to 'pedidos' and 'gruposMontagem' collections in Firestore.
 * - Keeps UI data in sync without writing from the frontend.
 * - Minimal observability via logs and cleanup on unmount.
 *
 * Note: Adjust collection names to match your Firestore schema if they differ
 * (e.g., 'pedidos', 'gruposMontagem', or domain-specific paths).
 */
export type Pedido = any;
export type GrupoMontagem = any;

export const usePedidosAndProductionGroups = () => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [gruposMontagem, setGruposMontagem] = useState<GrupoMontagem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // Early guard if Firestore DB is not initialized
    if (!db) {
      console.warn('[Phase A] Firestore DB not initialized. Skipping listeners.');
      setLoading(false);
      return;
    }

    // Helper to attach a real-time listener to a collection
    const attachListener = (path: string, mapDocs: (docs: any[]) => any[]) => {
      const unsub = onSnapshot(collection(db, path) as any, (snapshot: any) => {
        try {
          const items = snapshot.docs.map((d: any) => ({
            id: d.id,
            ...(d.data ? d.data() : {})
          }));
          const data = mapDocs(items);
          if (path === 'pedidos') {
            setPedidos(data);
          } else if (path === 'gruposMontagem') {
            setGruposMontagem(data);
          }
          console.log(`[Phase A] onSnapshot '${path}' updated (${snapshot.size} docs)`);
        } catch (err) {
          console.error(`[Phase A] error processing '${path}' snapshot`, err);
        }
      }, (err: any) => {
        console.error(`[Phase A] onSnapshot '${path}' encountered error:`, err);
      });
      unsubscribers.push(unsub);
    };

    // Map functions to extract plain data arrays from snapshots
    attachListener('pedidos', (docs) => docs.map((d: any) => ({ id: d.id, ...d })));
    attachListener('gruposMontagem', (docs) => docs.map((d: any) => ({ id: d.id, ...d })));

    setLoading(false);

    // Cleanup all listeners on unmount
    return () => {
      unsubscribers.forEach((fn) => {
        try { fn(); } catch (e) { console.error('[Phase A] error during unsubscribe', e); }
      });
      console.log('[Phase A] Phase A listeners cleaned up.');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  return {
    pedidos,
    gruposMontagem,
    loading,
  };
};

export default usePedidosAndProductionGroups;
