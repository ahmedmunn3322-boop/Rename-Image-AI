
export interface MockFile {
  id: string;
  originalName: string;
  extension: string;
  type: 'image' | 'vector';
}

export interface RenameSettings {
  startNumber: number;
  zeroPad: number;
}
