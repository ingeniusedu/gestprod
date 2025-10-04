"use client";

import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import ProductImportSelector from '../components/ProductImportSelector';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Kit, Modelo, Peca, ProductMetadata } from '../types';
import { getProductMetadataByProductIdAndType } from '../services/productMetadataService';
import { getProductHierarchy, EnrichedProduct } from '../utils/productHierarchyUtils';
import ProductMetadataEditor from '../components/ProductMetadataEditor';

export default function MetadataGestaoPage() {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProductType, setSelectedProductType] = useState<'kit' | 'modelo' | 'peca' | null>(null);
  const [enrichedProduct, setEnrichedProduct] = useState<EnrichedProduct | null>(null);
  const [productMetadata, setProductMetadata] = useState<ProductMetadata | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const handleProductSelect = async (id: string, type: 'kit' | 'modelo' | 'peca') => {
    setSelectedProductId(id);
    setSelectedProductType(type);
  };

  useEffect(() => {
    const fetchProductDetailsAndMetadata = async () => {
      if (selectedProductId && selectedProductType) {
        setLoadingDetails(true);
        setErrorDetails(null);
        try {
          const hierarchy = await getProductHierarchy(selectedProductId, selectedProductType);
          if (hierarchy) {
            setEnrichedProduct(hierarchy);
            // Fetch metadata for the top-level product
            const metadata = await getProductMetadataByProductIdAndType(selectedProductId, selectedProductType);
            setProductMetadata(metadata);
          } else {
            setEnrichedProduct(null);
            setProductMetadata(null);
            setErrorDetails(`Produto ${selectedProductType} com ID ${selectedProductId} não encontrado ou hierarquia incompleta.`);
          }
        } catch (err) {
          console.error("Error fetching product hierarchy or metadata:", err);
          setErrorDetails("Falha ao carregar hierarquia do produto ou metadados.");
        } finally {
          setLoadingDetails(false);
        }
      } else {
        setEnrichedProduct(null);
        setProductMetadata(null);
      }
    };

    fetchProductDetailsAndMetadata();
  }, [selectedProductId, selectedProductType]);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Gestão de Metadados de Produtos</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ProductImportSelector onProductSelect={handleProductSelect} />
        </div>

        <div className="lg:col-span-2">
          {loadingDetails ? (
            <div className="bg-white shadow rounded-lg p-6">
              <p className="text-gray-600">Carregando detalhes do produto...</p>
            </div>
          ) : errorDetails ? (
            <div className="bg-white shadow rounded-lg p-6">
              <p className="text-red-600">{errorDetails}</p>
            </div>
          ) : enrichedProduct ? (
            <ProductMetadataEditor
              product={enrichedProduct}
              initialMetadata={productMetadata}
              onMetadataUpdate={setProductMetadata}
            />
          ) : (
            <div className="bg-white shadow rounded-lg p-6">
              <p className="text-gray-600">Selecione um produto para gerenciar seus metadados.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
