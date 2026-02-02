"use client";

import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import { useAssemblyGroups } from '../../hooks/useAssemblyGroups';
import PackagingCardV2 from './packaging-v2/PackagingCardV2';

export default function ProcessandoEmbalagemV2() {
  const { assemblyGroups } = useAssemblyGroups();

  // Filtrar apenas grupos de montagem em fase de embalagem (targetProductType === 'produto_final')
  // Excluir grupos com status 'finalizado'
  const packagingGroups = useMemo(() => {
    return assemblyGroups.filter(group => 
      group.targetProductType === 'produto_final' && 
      group.status !== 'finalizado'
    );
  }, [assemblyGroups]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Processando Embalagem V2</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Package className="h-5 w-5" />
          <span>{packagingGroups.length} grupos em embalagem</span>
        </div>
      </div>

      {packagingGroups.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Nenhum grupo de montagem em fase de embalagem encontrado.</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto">
          {packagingGroups.map((assemblyGroup) => (
            <div key={assemblyGroup.id} className="mb-6">
              <PackagingCardV2
                assemblyGroup={assemblyGroup}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
