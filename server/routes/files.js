/**
 * File management routes
 * CRUD operations for project files
 */

const express = require('express');
const router = express.Router();

const { authMiddleware, getClientIp } = require('../middleware/auth');
const { rateLimitMiddleware } = require('../middleware/rateLimiter');
const { validatePath, validateFileContent } = require('../middleware/validator');

/**
 * Initialize file routes with dependencies
 * @param {FileExplorer} fileExplorer
 * @param {AuditLogger} auditLogger
 */
function createFileRoutes(fileExplorer, auditLogger) {
  /**
   * GET /api/files
   * List files in a directory
   */
  router.get('/',
    authMiddleware(),
    rateLimitMiddleware('api'),
    async (req, res, next) => {
      try {
        const { path: dirPath } = req.query;

        if (!dirPath) {
          return res.status(400).json({
            error: 'Path query parameter is required',
            code: 'MISSING_PATH'
          });
        }

        const entries = await fileExplorer.listDirectory(dirPath);

        res.json(entries);
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied: path is outside allowed directories',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: 'Directory not found',
            code: 'NOT_FOUND'
          });
        }
        if (error.code === 'ENOTDIR') {
          return res.status(400).json({
            error: 'Path is not a directory',
            code: 'NOT_A_DIRECTORY'
          });
        }
        next(error);
      }
    }
  );

  /**
   * GET /api/files/content
   * Read file content
   */
  router.get('/content',
    authMiddleware(),
    rateLimitMiddleware('api'),
    async (req, res, next) => {
      try {
        const { path: filePath } = req.query;

        if (!filePath) {
          return res.status(400).json({
            error: 'Path query parameter is required',
            code: 'MISSING_PATH'
          });
        }

        const content = await fileExplorer.readFile(filePath);

        // Log file read
        auditLogger.logFileRead(req.user.id, filePath, getClientIp(req));

        res.json({
          path: filePath,
          content
        });
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied: path is outside allowed directories',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.message.includes('too large')) {
          return res.status(413).json({
            error: 'File too large to read (max 10MB)',
            code: 'FILE_TOO_LARGE'
          });
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: 'File not found',
            code: 'NOT_FOUND'
          });
        }
        if (error.code === 'EISDIR') {
          return res.status(400).json({
            error: 'Path is a directory, not a file',
            code: 'IS_A_DIRECTORY'
          });
        }
        next(error);
      }
    }
  );

  /**
   * GET /api/files/info
   * Get file/directory metadata
   */
  router.get('/info',
    authMiddleware(),
    rateLimitMiddleware('api'),
    async (req, res, next) => {
      try {
        const { path: targetPath } = req.query;

        if (!targetPath) {
          return res.status(400).json({
            error: 'Path query parameter is required',
            code: 'MISSING_PATH'
          });
        }

        const info = await fileExplorer.getFileInfo(targetPath);

        res.json(info);
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: 'Path not found',
            code: 'NOT_FOUND'
          });
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/files/save
   * Save file content
   */
  router.post('/save',
    authMiddleware(),
    rateLimitMiddleware('fileWrite'),
    validatePath,
    validateFileContent,
    async (req, res, next) => {
      try {
        const savedPath = await fileExplorer.writeFile(
          req.validatedPath,
          req.validatedContent
        );

        // Log file write
        auditLogger.logFileWrite(req.user.id, req.validatedPath, getClientIp(req));

        res.json({
          message: 'File saved successfully',
          path: savedPath
        });
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied: path is outside allowed directories',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.message.includes('too large')) {
          return res.status(413).json({
            error: 'Content too large (max 10MB)',
            code: 'CONTENT_TOO_LARGE'
          });
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/files/mkdir
   * Create a new directory
   */
  router.post('/mkdir',
    authMiddleware(),
    rateLimitMiddleware('fileWrite'),
    validatePath,
    async (req, res, next) => {
      try {
        await fileExplorer.createDirectory(req.validatedPath);

        auditLogger.log({
          userId: req.user.id,
          action: 'directory_created',
          resourceType: 'file',
          resourceId: req.validatedPath,
          ipAddress: getClientIp(req)
        });

        res.status(201).json({
          message: 'Directory created successfully',
          path: req.validatedPath
        });
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.code === 'EEXIST') {
          return res.status(409).json({
            error: 'Directory already exists',
            code: 'ALREADY_EXISTS'
          });
        }
        next(error);
      }
    }
  );

  /**
   * DELETE /api/files
   * Delete a file or directory
   */
  router.delete('/',
    authMiddleware(),
    rateLimitMiddleware('fileWrite'),
    async (req, res, next) => {
      try {
        const { path: targetPath } = req.query;

        if (!targetPath) {
          return res.status(400).json({
            error: 'Path query parameter is required',
            code: 'MISSING_PATH'
          });
        }

        await fileExplorer.delete(targetPath);

        // Log file deletion
        auditLogger.logFileDelete(req.user.id, targetPath, getClientIp(req));

        res.json({
          message: 'Deleted successfully',
          path: targetPath
        });
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: 'Path not found',
            code: 'NOT_FOUND'
          });
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/files/rename
   * Rename/move a file or directory
   */
  router.post('/rename',
    authMiddleware(),
    rateLimitMiddleware('fileWrite'),
    async (req, res, next) => {
      try {
        const { oldPath, newPath } = req.body;

        if (!oldPath || !newPath) {
          return res.status(400).json({
            error: 'Both oldPath and newPath are required',
            code: 'MISSING_PATHS'
          });
        }

        await fileExplorer.rename(oldPath, newPath);

        auditLogger.log({
          userId: req.user.id,
          action: 'file_renamed',
          resourceType: 'file',
          resourceId: newPath,
          details: { oldPath, newPath },
          ipAddress: getClientIp(req)
        });

        res.json({
          message: 'Renamed successfully',
          oldPath,
          newPath
        });
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: 'Source path not found',
            code: 'NOT_FOUND'
          });
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/files/copy
   * Copy a file
   */
  router.post('/copy',
    authMiddleware(),
    rateLimitMiddleware('fileWrite'),
    async (req, res, next) => {
      try {
        const { srcPath, destPath } = req.body;

        if (!srcPath || !destPath) {
          return res.status(400).json({
            error: 'Both srcPath and destPath are required',
            code: 'MISSING_PATHS'
          });
        }

        await fileExplorer.copyFile(srcPath, destPath);

        auditLogger.log({
          userId: req.user.id,
          action: 'file_copied',
          resourceType: 'file',
          resourceId: destPath,
          details: { srcPath, destPath },
          ipAddress: getClientIp(req)
        });

        res.json({
          message: 'File copied successfully',
          srcPath,
          destPath
        });
      } catch (error) {
        if (error.message.includes('outside allowed')) {
          return res.status(403).json({
            error: 'Access denied',
            code: 'PATH_NOT_ALLOWED'
          });
        }
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            error: 'Source file not found',
            code: 'NOT_FOUND'
          });
        }
        next(error);
      }
    }
  );

  return router;
}

module.exports = createFileRoutes;
