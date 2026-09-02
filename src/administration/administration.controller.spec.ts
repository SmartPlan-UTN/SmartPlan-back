import { Test } from '@nestjs/testing';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';
import {
  ListAdminActivitiesQueryDto,
  ListAdminPermissionsQueryDto,
  ListAdminFeedbackQueryDto,
  ListAdminPlansQueryDto,
  ListAdminUsersQueryDto,
  UserStatusKey,
} from './dto/admin-list-query.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';

describe('AdministrationController', () => {
  let controller: AdministrationController;
  let service: jest.Mocked<
    Pick<
      AdministrationService,
      | 'listUsers'
      | 'updateUser'
      | 'changeUserStatus'
      | 'listActivities'
      | 'createActivity'
      | 'updateActivity'
      | 'removeActivity'
      | 'listPlans'
      | 'updatePlan'
      | 'removePlan'
      | 'listPermissions'
      | 'getPermission'
      | 'createPermission'
      | 'updatePermission'
      | 'removePermission'
      | 'replaceRolePermissions'
      | 'listFeedback'
      | 'reviewFeedback'
      | 'metrics'
    >
  >;

  beforeEach(async () => {
    service = {
      listUsers: jest.fn(),
      updateUser: jest.fn(),
      changeUserStatus: jest.fn(),
      listActivities: jest.fn(),
      createActivity: jest.fn(),
      updateActivity: jest.fn(),
      removeActivity: jest.fn(),
      listPlans: jest.fn(),
      updatePlan: jest.fn(),
      removePlan: jest.fn(),
      listPermissions: jest.fn(),
      getPermission: jest.fn(),
      createPermission: jest.fn(),
      updatePermission: jest.fn(),
      removePermission: jest.fn(),
      replaceRolePermissions: jest.fn(),
      listFeedback: jest.fn(),
      reviewFeedback: jest.fn(),
      metrics: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [AdministrationController],
      providers: [{ provide: AdministrationService, useValue: service }],
    }).compile();
    controller = module.get(AdministrationController);
  });

  it('lists users for the administration table (CU57)', async () => {
    const query = new ListAdminUsersQueryDto();
    const response = { data: [], pagination: pagination() };
    service.listUsers.mockResolvedValue(response);
    await expect(controller.listUsers(query)).resolves.toEqual(response);
    expect(service.listUsers).toHaveBeenCalledWith(query);
  });

  it('changes a user status (CU57)', async () => {
    const dto = { status: UserStatusKey.SUSPENDED };
    const request = {
      authentication: { id: 7 },
    } as AuthenticatedRequest;
    service.changeUserStatus.mockResolvedValue({ id: 9 } as never);
    await expect(
      controller.changeUserStatus(9, request, dto),
    ).resolves.toMatchObject({ id: 9 });
    expect(service.changeUserStatus).toHaveBeenCalledWith(7, 9, dto);
  });

  it('updates a user from administration (CU57)', async () => {
    const dto = { name: 'Updated', role: 'admin' as const };
    const request = {
      authentication: { id: 7 },
    } as AuthenticatedRequest;
    service.updateUser.mockResolvedValue({ id: 9 } as never);

    await expect(controller.updateUser(9, request, dto)).resolves.toMatchObject(
      {
        id: 9,
      },
    );
    expect(service.updateUser).toHaveBeenCalledWith(7, 9, dto);
  });

  it('lists managed activities (CU53)', async () => {
    const query = new ListAdminActivitiesQueryDto();
    const response = { data: [], pagination: pagination() };
    service.listActivities.mockResolvedValue(response);
    await expect(controller.listActivities(query)).resolves.toEqual(response);
  });

  it('creates an activity (CU53)', async () => {
    const dto = {
      name: 'City walk',
      description: 'Guided city walk',
      estimatedCost: 10,
      estimatedDuration: 90,
      categoryIds: [1],
    };
    service.createActivity.mockResolvedValue({ id: 3 } as never);
    await expect(controller.createActivity(dto)).resolves.toMatchObject({
      id: 3,
    });
    expect(service.createActivity).toHaveBeenCalledWith(dto);
  });

  it('updates an activity (CU53)', async () => {
    const dto = { name: 'Updated walk' };
    service.updateActivity.mockResolvedValue({ id: 3 } as never);
    await expect(controller.updateActivity(3, dto)).resolves.toMatchObject({
      id: 3,
    });
    expect(service.updateActivity).toHaveBeenCalledWith(3, dto);
  });

  it('deletes an activity (CU53)', async () => {
    service.removeActivity.mockResolvedValue();
    await expect(controller.removeActivity(3)).resolves.toBeUndefined();
    expect(service.removeActivity).toHaveBeenCalledWith(3);
  });

  it('lists managed plans (CU60)', async () => {
    const query = new ListAdminPlansQueryDto();
    const response = { data: [], pagination: pagination() };
    service.listPlans.mockResolvedValue(response);
    await expect(controller.listPlans(query)).resolves.toEqual(response);
  });

  it('updates a plan (CU60)', async () => {
    const dto = { title: 'Updated plan' };
    service.updatePlan.mockResolvedValue({ id: 4 } as never);
    await expect(controller.updatePlan(4, dto)).resolves.toMatchObject({
      id: 4,
    });
    expect(service.updatePlan).toHaveBeenCalledWith(4, dto);
  });

  it('deletes a plan (CU60)', async () => {
    service.removePlan.mockResolvedValue();
    await expect(controller.removePlan(4)).resolves.toBeUndefined();
    expect(service.removePlan).toHaveBeenCalledWith(4);
  });

  it('manages permissions and replaces role assignments (CU61)', async () => {
    const query = new ListAdminPermissionsQueryDto();
    const request = { authentication: { id: 7 } } as AuthenticatedRequest;
    const created = {
      key: 'collection.share',
      name: 'Share collections',
    };
    const replacement = { permissionIds: [1, 2] };
    service.listPermissions.mockResolvedValue({
      data: [],
      pagination: pagination(),
    });
    service.getPermission.mockResolvedValue({ id: 3 } as never);
    service.createPermission.mockResolvedValue({ id: 3 } as never);
    service.updatePermission.mockResolvedValue({ id: 3 } as never);
    service.removePermission.mockResolvedValue();
    service.replaceRolePermissions.mockResolvedValue({ id: 2 } as never);

    await expect(controller.listPermissions(query)).resolves.toMatchObject({
      data: [],
    });
    await expect(controller.getPermission(3)).resolves.toMatchObject({ id: 3 });
    await expect(
      controller.createPermission(request, created),
    ).resolves.toMatchObject({ id: 3 });
    await expect(
      controller.updatePermission(3, request, { name: 'Sharing' }),
    ).resolves.toMatchObject({ id: 3 });
    await expect(
      controller.removePermission(3, request),
    ).resolves.toBeUndefined();
    await expect(
      controller.replaceRolePermissions(2, request, replacement),
    ).resolves.toMatchObject({ id: 2 });
    expect(service.replaceRolePermissions).toHaveBeenCalledWith(
      7,
      2,
      replacement,
    );
  });

  it('lists and reviews user feedback (CU59)', async () => {
    const query = new ListAdminFeedbackQueryDto();
    const response = { data: [], pagination: pagination() };
    const request = {
      authentication: { id: 7 },
    } as AuthenticatedRequest;
    const dto = { status: 'processed' as const, note: 'Useful input.' };
    service.listFeedback.mockResolvedValue(response);
    service.reviewFeedback.mockResolvedValue({ id: 11 } as never);

    await expect(controller.listFeedback(query)).resolves.toEqual(response);
    await expect(
      controller.reviewFeedback(11, request, dto),
    ).resolves.toMatchObject({
      id: 11,
    });
    expect(service.listFeedback).toHaveBeenCalledWith(query);
    expect(service.reviewFeedback).toHaveBeenCalledWith(7, 11, dto);
  });

  it('returns REP-01 metrics (CU58)', async () => {
    const query = new MetricsQueryDto();
    service.metrics.mockResolvedValue({ kpis: { totalUsers: 2 } } as never);
    await expect(controller.metrics(query)).resolves.toMatchObject({
      kpis: { totalUsers: 2 },
    });
    expect(service.metrics).toHaveBeenCalledWith(query);
  });
});

function pagination() {
  return { page: 1, limit: 20, total: 0, totalPages: 0 };
}
