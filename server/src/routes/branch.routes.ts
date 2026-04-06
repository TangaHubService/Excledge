import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getBranchesController,
  getBranch,
  getUserBranchesController,
  getUserPrimaryBranchController,
  createBranchController,
  updateBranchController,
  deleteBranchController,
  assignUserToBranchController,
  removeUserFromBranchController,
  getBranchUsersController,
} from '../controllers/branch.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all branches
router.get('/:organizationId', getBranchesController);

// Get user's branches
router.get('/user/all', getUserBranchesController);

// Get user's primary branch
router.get('/user/primary', getUserPrimaryBranchController);

// Get single branch
router.get('/:organizationId/:id', getBranch);

// Create branch (Admin/Manager only)
router.post('/:organizationId', authorize('ADMIN', 'ACCOUNTANT'), createBranchController);

// Update branch (Admin/Manager only)
router.put('/:organizationId/:id', authorize('ADMIN', 'ACCOUNTANT'), updateBranchController);

// Delete branch (Admin only)
router.delete('/:organizationId/:id', authorize('ADMIN'), deleteBranchController);

// Assign user to branch
router.post('/:organizationId/:id/users', authorize('ADMIN'), assignUserToBranchController);

// Remove user from branch
router.delete('/:organizationId/:id/users/:userId', authorize('ADMIN'), removeUserFromBranchController);

// Get branch users
router.get('/:organizationId/:id/users', authorize('ADMIN'), getBranchUsersController);

export default router;
