/**
 * FileExplorer Unit Tests
 * TDD: Tests for file system operations with security focus
 */

const path = require('path');

// Mock fs.promises before requiring FileExplorer
jest.mock('fs', () => ({
  promises: {
    realpath: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
    mkdir: jest.fn()
  }
}));

const fs = require('fs').promises;

let FileExplorer;

describe('FileExplorer', () => {
  beforeAll(() => {
    process.env.ALLOWED_FILE_ROOTS = '/projects:/home/user/work';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    FileExplorer = require('../../services/FileExplorer');
  });

  describe('constructor', () => {
    it('should initialize with allowed roots from environment', () => {
      const fe = new FileExplorer();

      expect(fe.allowedRoots).toContain('/projects');
      expect(fe.allowedRoots).toContain('/home/user/work');
    });

    it('should throw error when ALLOWED_FILE_ROOTS not set', () => {
      delete process.env.ALLOWED_FILE_ROOTS;

      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');

      expect(() => new FileExplorer()).toThrow('ALLOWED_FILE_ROOTS');
    });
  });

  describe('validatePath', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects:/home/user/work';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should accept path within allowed roots', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects/my-app/src/index.js');

      const result = await fe.validatePath('/projects/my-app/src/index.js');

      expect(result).toBe('/projects/my-app/src/index.js');
    });

    it('should reject path traversal attempts', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/etc/passwd');

      await expect(fe.validatePath('../../../etc/passwd'))
        .rejects.toThrow('outside allowed directories');
    });

    it('should reject /projects-evil prefix attack', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects-evil/malicious/file.txt');

      await expect(fe.validatePath('/projects-evil/malicious/file.txt'))
        .rejects.toThrow('outside allowed directories');
    });

    it('should reject . and .. as filename', async () => {
      const fe = new FileExplorer();

      await expect(fe.validatePath('/projects/..'))
        .rejects.toThrow('Invalid filename');
    });

    it('should reject . as filename', async () => {
      const fe = new FileExplorer();

      await expect(fe.validatePath('/projects/.'))
        .rejects.toThrow('Invalid filename');
    });

    it('should accept exact root path', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects');

      const result = await fe.validatePath('/projects');

      expect(result).toBe('/projects');
    });

    it('should handle new file creation (parent exists)', async () => {
      const fe = new FileExplorer();

      // First realpath call fails (file doesn't exist)
      // Second call for parent succeeds
      fs.realpath
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce('/projects/my-app');

      const result = await fe.validatePath('/projects/my-app/new-file.js');

      expect(result).toBe('/projects/my-app/new-file.js');
    });
  });

  describe('listDirectory', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should list directory contents', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects/my-app');
      fs.readdir.mockResolvedValue([
        { name: 'src', isDirectory: () => true, isSymbolicLink: () => false },
        { name: 'package.json', isDirectory: () => false, isSymbolicLink: () => false },
        { name: 'node_modules', isDirectory: () => true, isSymbolicLink: () => true }
      ]);

      const result = await fe.listDirectory('/projects/my-app');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'src',
        relativePath: 'my-app/src',
        type: 'directory',
        isSymlink: false
      });
      expect(result[1]).toEqual({
        name: 'package.json',
        relativePath: 'my-app/package.json',
        type: 'file',
        isSymlink: false
      });
    });

    it('should return relative paths to prevent internal path exposure', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects/secret-internal-path/app');
      fs.readdir.mockResolvedValue([
        { name: 'file.js', isDirectory: () => false, isSymbolicLink: () => false }
      ]);

      const result = await fe.listDirectory('/projects/secret-internal-path/app');

      // Should not expose full internal path
      expect(result[0].relativePath).not.toContain('/projects/secret-internal-path');
    });

    it('should reject path outside allowed roots', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/etc');

      await expect(fe.listDirectory('/etc')).rejects.toThrow('outside allowed');
    });
  });

  describe('readFile', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should read file contents', async () => {
      const fe = new FileExplorer();
      const fileContent = 'console.log("hello");';

      fs.realpath.mockResolvedValue('/projects/app/index.js');
      fs.stat.mockResolvedValue({ size: fileContent.length });
      fs.readFile.mockResolvedValue(fileContent);

      const result = await fe.readFile('/projects/app/index.js');

      expect(result).toBe(fileContent);
    });

    it('should reject files larger than 10MB', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects/app/huge.bin');
      fs.stat.mockResolvedValue({ size: 11 * 1024 * 1024 }); // 11MB

      await expect(fe.readFile('/projects/app/huge.bin'))
        .rejects.toThrow('File too large');
    });

    it('should reject reading files outside allowed roots', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/etc/passwd');

      await expect(fe.readFile('/etc/passwd')).rejects.toThrow('outside allowed');
    });
  });

  describe('writeFile', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should write file contents', async () => {
      const fe = new FileExplorer();
      const content = 'new content';

      fs.realpath.mockResolvedValue('/projects/app/file.js');
      fs.writeFile.mockResolvedValue();

      const result = await fe.writeFile('/projects/app/file.js', content);

      expect(fs.writeFile).toHaveBeenCalledWith('/projects/app/file.js', content, 'utf-8');
      expect(result).toBe('/projects/app/file.js');
    });

    it('should reject content larger than 10MB', async () => {
      const fe = new FileExplorer();
      const largeContent = 'a'.repeat(11 * 1024 * 1024);

      fs.realpath.mockResolvedValue('/projects/app/file.js');

      await expect(fe.writeFile('/projects/app/file.js', largeContent))
        .rejects.toThrow('Content too large');
    });

    it('should allow creating new files in allowed directories', async () => {
      const fe = new FileExplorer();

      // File doesn't exist, parent does
      fs.realpath
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce('/projects/app');
      fs.writeFile.mockResolvedValue();

      await fe.writeFile('/projects/app/new-file.js', 'content');

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should delete a file', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects/app/old-file.js');
      fs.stat.mockResolvedValue({ isDirectory: () => false });
      fs.unlink.mockResolvedValue();

      await fe.delete('/projects/app/old-file.js');

      expect(fs.unlink).toHaveBeenCalledWith('/projects/app/old-file.js');
    });

    it('should delete a directory recursively', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/projects/app/old-dir');
      fs.stat.mockResolvedValue({ isDirectory: () => true });
      fs.rm.mockResolvedValue();

      await fe.delete('/projects/app/old-dir');

      expect(fs.rm).toHaveBeenCalledWith('/projects/app/old-dir', { recursive: true });
    });

    it('should reject deletion outside allowed roots', async () => {
      const fe = new FileExplorer();

      fs.realpath.mockResolvedValue('/etc/important');

      await expect(fe.delete('/etc/important')).rejects.toThrow('outside allowed');
    });
  });

  describe('createDirectory', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should create a new directory', async () => {
      const fe = new FileExplorer();

      // Directory doesn't exist, parent does
      fs.realpath
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce('/projects/app');
      fs.mkdir.mockResolvedValue();

      await fe.createDirectory('/projects/app/new-dir');

      expect(fs.mkdir).toHaveBeenCalledWith('/projects/app/new-dir', { recursive: true });
    });
  });

  describe('getFileInfo', () => {
    beforeEach(() => {
      process.env.ALLOWED_FILE_ROOTS = '/projects';
      jest.resetModules();
      FileExplorer = require('../../services/FileExplorer');
    });

    it('should return file metadata', async () => {
      const fe = new FileExplorer();
      const mockStat = {
        size: 1024,
        mtime: new Date('2024-01-01'),
        ctime: new Date('2024-01-01'),
        isDirectory: () => false,
        isSymbolicLink: () => false
      };

      fs.realpath.mockResolvedValue('/projects/app/file.js');
      fs.stat.mockResolvedValue(mockStat);

      const result = await fe.getFileInfo('/projects/app/file.js');

      expect(result).toEqual({
        name: 'file.js',
        path: '/projects/app/file.js',
        size: 1024,
        modifiedAt: mockStat.mtime,
        createdAt: mockStat.ctime,
        isDirectory: false,
        isSymlink: false
      });
    });
  });
});
