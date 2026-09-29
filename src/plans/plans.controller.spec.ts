import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { PlanSearchQueryDto } from './dto/plan-search-query.dto';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

describe('PlansController', () => {
  let controller: PlansController;
  let service: jest.Mocked<Pick<PlansService, 'search' | 'findOne'>>;

  beforeEach(() => {
    service = {
      search: jest.fn(),
      findOne: jest.fn(),
    };
    controller = new PlansController(service as unknown as PlansService);
  });

  it('does not mark every plan route as public', () => {
    expect(Reflect.getMetadata(PUBLIC_KEY, PlansController)).toBeUndefined();
  });

  it('passes the authenticated user to the plan detail service', async () => {
    const user: SessionUserDto = {
      id: 42,
      name: 'Ana',
      lastName: 'Perez',
      email: 'ana@example.com',
      role: { key: 'user', name: 'User' },
      permissions: [],
    };
    const response = { id: 2 };
    service.findOne.mockResolvedValue(response as never);

    await expect(controller.findOne(2, user)).resolves.toBe(response);
    expect(service.findOne).toHaveBeenCalledWith(2, 42);
  });

  it('keeps anonymous access available for the plan listing', async () => {
    const query = new PlanSearchQueryDto();
    const response = { data: [], pagination: {} };
    service.search.mockResolvedValue(response as never);

    await expect(controller.search(query)).resolves.toBe(response);
    expect(service.search).toHaveBeenCalledWith(query, null);
  });
});
