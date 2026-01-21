import React, { useMemo } from 'react';
import { Cpu, Layers, Settings, Clock } from 'lucide-react';
import type { ProductHierarchyNode } from './ProductHierarchyTree';

interface ComponentJourneyCardProps {
  node: ProductHierarchyNode;
  allProductionGroups?: any[];
  allGroups?: any[];
}

export const ComponentJourneyCard: React.FC<ComponentJourneyCardProps> = ({ node, allProductionGroups = [], allGroups = [] }) => {
  
  // Usar dados diretos do nó (jornadaIds) em vez de buscar externamente
  const productionGroups = useMemo(() => {
    if (!node.jornadaIds?.gruposProducao || node.jornadaIds.gruposProducao.length === 0) {
      return [];
    }
    
    const gruposProducaoIds = node.jornadaIds.gruposProducao;
    return allProductionGroups.filter(grupo => 
      gruposProducaoIds.includes(grupo.id)
    );
  }, [node.jornadaIds?.gruposProducao, allProductionGroups]);

  const assemblyGroups = useMemo(() => {
    if (!node.jornadaIds?.gruposMontagem || node.jornadaIds.gruposMontagem.length === 0) {
      return [];
    }
    
    const gruposMontagemIds = node.jornadaIds.gruposMontagem;
    return allGroups.filter(grupo => 
      gruposMontagemIds.includes(grupo.id)
    );
  }, [node.jornadaIds?.gruposMontagem, allGroups]);

  if (productionGroups.length === 0 && assemblyGroups.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6 mt-6">
        <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
          <Settings className="h-5 w-5 mr-2 text-gray-500" />
          Jornada do Componente: {node.nome}
        </h3>
        <p className="text-gray-500 text-sm italic">Nenhum grupo de produção ou montagem vinculado diretamente a este componente.</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concluido': 
      case 'produzido':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'em_producao': 
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'aguardando': 
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: 
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 mt-6 border-l-4 border-blue-500">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Settings className="h-5 w-5 mr-2 text-blue-600" />
            Jornada do Componente: {node.nome}
          </h3>
          <p className="text-sm text-gray-500 mt-1 uppercase tracking-wider font-semibold">
            {node.tipo} • Necessário: {node.quantidadeNecessaria}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Etapa de Produção (Impressão/Fabricação) */}
        {productionGroups.length > 0 && (
          <div className="relative">
            <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-gray-200"></div>
            <div className="flex items-start mb-4">
              <div className="z-10 bg-blue-600 rounded-full p-2 mr-4">
                <Cpu className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-md font-semibold text-gray-800">Grupos de Produção</h4>
                <div className="mt-3 space-y-3">
                  {productionGroups.map((gp) => (
                    <div key={gp.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">GP: {gp.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(gp.status)}`}>
                          {gp.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>Cor: {gp.corFilamento}</div>
                        <div>Tipo: {gp.pecaTipoDetalhado}</div>
                        <div className="col-span-2 mt-1">
                          Qtd: {gp.quantidadeProduzirGrupo} unidades
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Etapa de Montagem */}
        {assemblyGroups.length > 0 && (
          <div className="relative">
            <div className="flex items-start">
              <div className="z-10 bg-purple-600 rounded-full p-2 mr-4">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-md font-semibold text-gray-800">Grupos de Montagem</h4>
                <div className="mt-3 space-y-3">
                  {assemblyGroups.map((gm) => (
                    <div key={gm.id || Math.random().toString()} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">GM: {gm.id || 'N/A'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(gm.status || 'aguardando')}`}>
                          {gm.status || 'aguardando'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {gm.assemblyInstanceId && (
                          <div className="mb-1 text-blue-600 font-mono text-[10px] break-all">ID: {gm.assemblyInstanceId}</div>
                        )}
                        <div>Pedido: {gm.pedidoNumero}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
        <div className="text-xs text-gray-400 flex items-center">
          <Clock className="h-3 w-3 mr-1" />
          Dados atualizados em tempo real
        </div>
      </div>
    </div>
  );
};
