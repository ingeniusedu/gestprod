"use client";

import React, { useState, useEffect } from 'react';
import { ImageMetadata, ProductMetadata } from '../types';

console.log("ProductMetadataEditor.tsx loaded with latest changes."); // Add this log
import { EnrichedProduct, EnrichedKit, EnrichedModelo, EnrichedPeca, EnrichedParte } from '../utils/productHierarchyUtils';
import { createProductMetadata, updateProductMetadata, getProductMetadataByProductIdAndType } from '../services/productMetadataService';
import { uploadImageAndGetUrl } from '../services/firebaseStorageService';
import { Save } from 'lucide-react';
import CollapsiblePanel from './CollapsiblePanel';
import ImageManager from './ImageManager';
// import { getFunctions, httpsCallable } from 'firebase/functions'; // No longer needed for onRequest functions
// import app from '../services/firebase'; // No longer needed if only used for getFunctions

// Helper function to determine product type reliably
const getProductTypeFromEnrichedProduct = (product: EnrichedProduct): ProductMetadata['productType'] => {
  if ('componentes' in product) {
    return 'kit';
  }
  if ('pecas' in product) {
    return 'modelo';
  }
  if ('gruposImpressao' in product) {
    return 'peca';
  }
  return 'parte';
};

interface ProductMetadataEditorProps {
  product: EnrichedProduct;
  initialMetadata: ProductMetadata | null;
  onMetadataUpdate: (updatedMetadata: ProductMetadata) => void;
}

const ProductMetadataEditor: React.FC<ProductMetadataEditorProps> = ({ product, initialMetadata, onMetadataUpdate }) => {
  const handleImagesChange = (newImages: ImageMetadata[]) => {
    setMetadata(prev => ({ ...prev, images: newImages }));
  };

  const renderComponentEditor = (component: EnrichedProduct, level: number = 0) => {
    const componentType = getProductTypeFromEnrichedProduct(component);
    const componentId = component.id as string;
    const componentName = component.nome;
    const componentSku = component.sku;

    const [compMetadata, setCompMetadata] = useState<ProductMetadata | null>(null);
    const [compSaving, setCompSaving] = useState(false);
    const [compSaveError, setCompSaveError] = useState<string | null>(null);
    const [compSaveSuccess, setCompSaveSuccess] = useState(false);

    useEffect(() => {
      const fetchCompMetadata = async () => {
        if (componentId && componentType) {
          const fetchedMetadata = await getProductMetadataByProductIdAndType(componentId, componentType);
          setCompMetadata(fetchedMetadata || {
            productId: componentId,
            productType: componentType,
            description: '',
            images: [],
          });
        }
      };
      fetchCompMetadata();
    }, [componentId, componentType]);

    const handleCompDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCompMetadata(prev => prev ? { ...prev, description: e.target.value } : null);
    };

    const handleCompImagesChange = (newImages: ImageMetadata[]) => {
      setCompMetadata(prev => prev ? { ...prev, images: newImages } : null);
    };

    const handleCompSaveMetadata = async () => {
      setCompSaving(true);
      setCompSaveError(null);
      setCompSaveSuccess(false);
      try {
        console.log("Component metadata being saved:", compMetadata);
        if (compMetadata?.id) {
          await updateProductMetadata(compMetadata.id, compMetadata);
        } else if (compMetadata) {
          const newMetadata = await createProductMetadata(compMetadata);
          setCompMetadata(newMetadata);
        }
        setCompSaveSuccess(true);
        setTimeout(() => setCompSaveSuccess(false), 3000);
      } catch (err) {
        console.error("Error saving component metadata:", err);
        setCompSaveError("Falha ao salvar metadados do componente. Tente novamente.");
      } finally {
        setCompSaving(false);
      }
    };

    return (
      <CollapsiblePanel
        key={componentId}
        title={
          <span className="text-lg font-semibold">
            {componentName} ({componentSku}) - <span className="capitalize">{componentType}</span>
          </span>
        }
        initialOpen={level === 0} // Open the top-level component by default
      >
        <div className={`pt-2 ${level > 0 ? 'pl-4 border-l border-gray-200' : ''}`}> {/* Adjusted padding and added subtle border for nested levels */}
          <CollapsiblePanel
            title={<span className="font-medium text-gray-700">Descrição do Componente</span>}
            initialOpen={true}
          >
            <textarea
              id={`description-${componentId}`}
              value={compMetadata?.description || ''}
              onChange={handleCompDescriptionChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-y"
            />
          </CollapsiblePanel>

          <ImageManager
            images={compMetadata?.images || []}
            onImagesChange={handleCompImagesChange}
            componentId={componentId}
            componentDescription={compMetadata?.description || ''}
          />

          <div className="mt-4 flex justify-end items-center space-x-2">
            {compSaving && <p className="text-sm text-blue-600">Salvando...</p>}
            {compSaveError && <p className="text-sm text-red-600">{compSaveError}</p>}
            {compSaveSuccess && <p className="text-sm text-green-600">Salvo com sucesso!</p>}
            <button
              onClick={handleCompSaveMetadata}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              disabled={compSaving}
            >
              <Save className="h-4 w-4 mr-2" /> Salvar Metadados
            </button>
          </div>

          {/* Recursively render children */}
          {'modelosDetalhes' in component && component.modelosDetalhes?.map(m => renderComponentEditor(m, level + 1))}
          {'pecasDetalhes' in component && component.pecasDetalhes?.map(p => renderComponentEditor(p, level + 1))}
          {'partesDetalhes' in component && component.partesDetalhes?.map(pa => renderComponentEditor(pa, level + 1))}
        </div>
      </CollapsiblePanel>
    );
  };

  return (
    <div className="p-6"> {/* Removed bg-white, shadow, rounded-lg */}
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Editar Metadados para {product.nome} ({product.sku})
      </h2>

      {renderComponentEditor(product)}
    </div>
  );
};

export default ProductMetadataEditor;
