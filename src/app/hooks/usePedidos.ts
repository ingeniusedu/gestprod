import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Pedido } from '../types';

export const usePedidos = () => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  useEffect(() => {
    // Query pedidos that are not 'concluido' or 'cancelado'
    const q = query(
      collection(db, 'pedidos'),
      where('status', 'not-in', ['concluido', 'cancelado'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedPedidos: Pedido[] = [];
      snapshot.forEach((doc) => {
        updatedPedidos.push({ id: doc.id, ...doc.data() } as Pedido);
      });
      setPedidos(updatedPedidos);
    });

    return () => unsubscribe();
  }, []);

  return { pedidos };
};
