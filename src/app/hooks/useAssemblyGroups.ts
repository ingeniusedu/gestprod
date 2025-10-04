import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { GrupoMontagem } from '../types';

export const useAssemblyGroups = () => {
  const [assemblyGroups, setAssemblyGroups] = useState<GrupoMontagem[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'gruposMontagem'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groups: GrupoMontagem[] = [];
      snapshot.forEach((doc) => {
        const groupData = { id: doc.id, ...doc.data() } as GrupoMontagem;

        // Calculate quantidadeAtendida for partesNecessarias
        if (groupData.partesNecessarias) {
          groupData.partesNecessarias = groupData.partesNecessarias.map(parte => {
            if (parte.atendimentoDetalhado && parte.atendimentoDetalhado.length > 0) {
              const totalAtendido = parte.atendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0);
              return { ...parte, quantidadeAtendida: totalAtendido };
            }
            return { ...parte, quantidadeAtendida: parte.quantidadeAtendida || 0 }; // Ensure it's at least 0 if not detailed
          });
        }
        
        // Calculate quantidadeAtendida for pecasNecessarias (for Modelo assembly)
        if (groupData.pecasNecessarias) {
          groupData.pecasNecessarias = groupData.pecasNecessarias.map(peca => {
            if (peca.atendimentoDetalhado && peca.atendimentoDetalhado.length > 0) {
              const totalAtendido = peca.atendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0);
              return { ...peca, quantidadeAtendida: totalAtendido };
            }
            return { ...peca, quantidadeAtendida: peca.quantidadeAtendida || 0 };
          });
        }

        groups.push(groupData);
      });
      setAssemblyGroups(groups);
    });

    return () => unsubscribe();
  }, []);

  return { assemblyGroups };
};
