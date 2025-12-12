import React from 'react';
import { NestingBoard } from './NestingBoard';
import type { ImportedPart } from './types';

interface DxfReaderProps {
    preLoadedParts?: ImportedPart[];
    autoSearchQuery?: string; // <--- NOVO PROP
    onBack: () => void;
}

export const DxfReader: React.FC<DxfReaderProps> = ({ preLoadedParts, autoSearchQuery, onBack }) => {
    return (
        <NestingBoard 
            initialParts={preLoadedParts || []} 
            initialSearchQuery={autoSearchQuery} // <--- Repassa para a mesa
            onBack={onBack} 
        />
    );
};