import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ProductMetadata } from '../types';

const productMetadataCollection = collection(db, 'productMetadata');

export const getProductMetadata = async (id: string): Promise<ProductMetadata | null> => {
  const docRef = doc(productMetadataCollection, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    console.log("Raw metadata from Firestore (getProductMetadata):", data);
    return { id: docSnap.id, ...data } as ProductMetadata;
  }
  return null;
};

export const getProductMetadataByProductIdAndType = async (productId: string, productType: ProductMetadata['productType']): Promise<ProductMetadata | null> => {
  console.log(`Attempting to fetch metadata for productId: ${productId}, productType: ${productType}`);
  const q = query(
    productMetadataCollection,
    where('productId', '==', productId),
    where('productType', '==', productType)
  );
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    console.log(`Metadata found for productId: ${productId}, productType: ${productType}. Raw data:`, data);
    return { id: docSnap.id, ...data } as ProductMetadata;
  }
  console.log(`No metadata found for productId: ${productId}, productType: ${productType}.`);
  return null;
};

export const createProductMetadata = async (metadata: Omit<ProductMetadata, 'id'>): Promise<ProductMetadata> => {
  const docRef = await addDoc(productMetadataCollection, metadata);
  return { id: docRef.id, ...metadata };
};

export const updateProductMetadata = async (id: string, metadata: Partial<ProductMetadata>): Promise<void> => {
  const docRef = doc(productMetadataCollection, id);
  await updateDoc(docRef, metadata);
};

export const deleteProductMetadata = async (id: string): Promise<void> => {
  const docRef = doc(productMetadataCollection, id);
  await deleteDoc(docRef);
};
