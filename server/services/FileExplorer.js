/**
 * FileExplorer - Secure file system operations
 *
 * Key security features:
 * - Path whitelist validation with symlink resolution
 * - Path traversal prevention (../, prefix attacks)
 * - File size limits (10MB)
 * - Relative path output to prevent internal path exposure
 */

const fs = require('fs').promises;
const path = require('path');

class FileExplorer {
  constructor() {
    this.allowedRoots = (process.env.ALLOWED_FILE_ROOTS || '')
      .split(':')
      .filter(Boolean)
      .map(p => path.resolve(p));

    if (this.allowedRoots.length === 0) {
      throw new Error('ALLOWED_FILE_ROOTS environment variable is required');
    }

    // Maximum file size for read/write operations (10MB)
    this.maxFileSize = 10 * 1024 * 1024;
  }

  /**
   * Validate path against whitelist with security checks
   * @param {string} userPath - User-provided path
   * @returns {Promise<string>} Validated real path
   * @throws {Error} If path is invalid or outside allowed directories
   */
  async validatePath(userPath) {
    // Step 1: Normalize path
    const normalized = path.resolve(userPath);

    // Step 2: Check for . and .. as filename (security)
    const basename = path.basename(normalized);
    if (basename === '..' || basename === '.') {
      throw new Error('Invalid filename: cannot use . or .. as filename');
    }

    // Step 3: Resolve symlinks to get real path
    let realPath;
    try {
      realPath = await fs.realpath(normalized);
    } catch (error) {
      // File doesn't exist - validate parent directory for new file creation
      if (error.code === 'ENOENT') {
        const parentPath = path.dirname(normalized);
        const parentReal = await fs.realpath(parentPath);

        // Check parent is in allowed roots
        const isParentAllowed = this.allowedRoots.some(root =>
          parentReal === root || parentReal.startsWith(root + path.sep)
        );

        if (!isParentAllowed) {
          throw new Error(`Access denied: ${userPath} is outside allowed directories`);
        }

        // Return normalized path for new file
        return path.join(parentReal, path.basename(normalized));
      }
      throw error;
    }

    // Step 4: Check against whitelist with path.sep to prevent prefix attacks
    const isAllowed = this.allowedRoots.some(root =>
      realPath === root || realPath.startsWith(root + path.sep)
    );

    if (!isAllowed) {
      throw new Error(`Access denied: ${userPath} is outside allowed directories`);
    }

    return realPath;
  }

  /**
   * List directory contents
   * @param {string} dirPath - Directory path
   * @param {string} baseRoot - Optional base root for relative path calculation
   * @returns {Promise<Array>} Directory entries with metadata
   */
  async listDirectory(dirPath, baseRoot = null) {
    const validPath = await this.validatePath(dirPath);

    const entries = await fs.readdir(validPath, { withFileTypes: true });

    // Use first allowed root if no base specified
    const effectiveRoot = baseRoot || this.allowedRoots[0];

    return entries.map(entry => ({
      name: entry.name,
      // Return relative path to prevent server path exposure
      relativePath: path.relative(effectiveRoot, path.join(validPath, entry.name)),
      type: entry.isDirectory() ? 'directory' : 'file',
      isSymlink: entry.isSymbolicLink()
    }));
  }

  /**
   * Read file contents
   * @param {string} filePath - File path
   * @returns {Promise<string>} File content as UTF-8 string
   */
  async readFile(filePath) {
    const validPath = await this.validatePath(filePath);

    // Check file size
    const stat = await fs.stat(validPath);
    if (stat.size > this.maxFileSize) {
      throw new Error(`File too large (max ${this.maxFileSize / 1024 / 1024}MB)`);
    }

    return await fs.readFile(validPath, 'utf-8');
  }

  /**
   * Write file contents
   * @param {string} filePath - File path
   * @param {string} content - Content to write
   * @returns {Promise<string>} Written file path
   */
  async writeFile(filePath, content) {
    // Check content size
    if (Buffer.byteLength(content, 'utf-8') > this.maxFileSize) {
      throw new Error(`Content too large (max ${this.maxFileSize / 1024 / 1024}MB)`);
    }

    const validPath = await this.validatePath(filePath);

    await fs.writeFile(validPath, content, 'utf-8');
    return validPath;
  }

  /**
   * Delete file or directory
   * @param {string} targetPath - Path to delete
   */
  async delete(targetPath) {
    const validPath = await this.validatePath(targetPath);

    const stat = await fs.stat(validPath);

    if (stat.isDirectory()) {
      await fs.rm(validPath, { recursive: true });
    } else {
      await fs.unlink(validPath);
    }
  }

  /**
   * Create a new directory
   * @param {string} dirPath - Directory path
   */
  async createDirectory(dirPath) {
    const validPath = await this.validatePath(dirPath);

    await fs.mkdir(validPath, { recursive: true });
  }

  /**
   * Get file/directory metadata
   * @param {string} targetPath - Path to get info for
   * @returns {Promise<Object>} File metadata
   */
  async getFileInfo(targetPath) {
    const validPath = await this.validatePath(targetPath);

    const stat = await fs.stat(validPath);

    return {
      name: path.basename(validPath),
      path: validPath,
      size: stat.size,
      modifiedAt: stat.mtime,
      createdAt: stat.ctime,
      isDirectory: stat.isDirectory(),
      isSymlink: stat.isSymbolicLink()
    };
  }

  /**
   * Check if path exists
   * @param {string} targetPath - Path to check
   * @returns {Promise<boolean>}
   */
  async exists(targetPath) {
    try {
      await this.validatePath(targetPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Rename/move a file or directory
   * @param {string} oldPath - Current path
   * @param {string} newPath - New path
   */
  async rename(oldPath, newPath) {
    const validOldPath = await this.validatePath(oldPath);
    const validNewPath = await this.validatePath(newPath);

    await fs.rename(validOldPath, validNewPath);
  }

  /**
   * Copy a file
   * @param {string} srcPath - Source path
   * @param {string} destPath - Destination path
   */
  async copyFile(srcPath, destPath) {
    const validSrcPath = await this.validatePath(srcPath);
    const validDestPath = await this.validatePath(destPath);

    await fs.copyFile(validSrcPath, validDestPath);
  }
}

module.exports = FileExplorer;
