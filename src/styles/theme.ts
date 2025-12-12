export interface AppTheme {
    batchBg: Background<string | number> | undefined;
    bg: string;
    panelBg: string;
    headerBg: string;
    text: string;
    border: string;
    cardBg: string;
    inputBg: string;
    hoverRow: string;
    selectedRow: string;
    label: string;
    modalBg: string;
    modalOverlay: string;
    
    // Específicos do Canvas
    canvasBg: string;
    gridLine: string;
    buttonBg: string;
    buttonBorder: string;
    buttonText: string;
}

export const getTheme = (isDark: boolean): AppTheme => ({
    bg: isDark ? '#1e1e1e' : '#f5f5f5',
    panelBg: isDark ? '#1e1e1e' : '#ffffff',
    headerBg: isDark ? '#252526' : '#e0e0e0',
    text: isDark ? '#e0e0e0' : '#333333',
    border: isDark ? '#444' : '#ccc',
    cardBg: isDark ? '#2d2d2d' : '#ffffff',
    inputBg: isDark ? '#2d2d2d' : '#ffffff',
    hoverRow: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    selectedRow: isDark ? 'rgba(0, 123, 255, 0.2)' : 'rgba(0, 123, 255, 0.1)',
    label: isDark ? '#aaa' : '#666',
    modalBg: isDark ? '#252526' : '#fff',
    modalOverlay: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)',
    
    // Canvas
    canvasBg: isDark ? '#121212' : '#e5e5e5',
    gridLine: isDark ? '#333' : '#ccc',
    buttonBg: isDark ? 'rgba(40,40,40,0.9)' : 'rgba(255,255,255,0.9)',
    buttonBorder: isDark ? '#555' : '#999',
    buttonText: isDark ? '#fff' : '#000',
});