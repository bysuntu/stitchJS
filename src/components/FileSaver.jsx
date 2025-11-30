import React from 'react';

const FileSaver = () => {
  const handleSaveFile = async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'hello.txt',
        types: [{
          description: 'Text Files',
          accept: {
            'text/plain': ['.txt'],
          },
        }],
      });

      const writable = await handle.createWritable();
      await writable.write('Hello World');
      await writable.close();
      
      alert('File saved successfully!');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        alert('Could not save the file.');
      }
    }
  };

  return (
    <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
      <button onClick={handleSaveFile}>
        Save Hello World
      </button>
    </div>
  );
};

export default FileSaver;
