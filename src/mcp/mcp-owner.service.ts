import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { User } from '../users/entities/user.entity';

/**
 * Who owns what the MCP loader creates: `MCP_OWNER_USER_ID` when set, else
 * the first administrator (lowest id).
 */
@Injectable()
export class McpOwnerService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async resolveOwnerId(): Promise<number> {
    const configured = this.config.get('MCP_OWNER_USER_ID', { infer: true });
    if (configured) {
      const user = await this.users.findOne({ where: { id: configured } });
      if (!user) {
        throw new NotFoundException({
          code: 'MCP_OWNER_NOT_FOUND',
          message: `MCP_OWNER_USER_ID points to user ${configured}, which does not exist`,
        });
      }
      return user.id;
    }
    const admin = await this.users.findOne({
      where: { role: { key: 'admin' } },
      relations: { role: true },
      order: { id: 'ASC' },
    });
    if (!admin) {
      throw new NotFoundException({
        code: 'MCP_OWNER_NOT_AVAILABLE',
        message:
          'There is no administrator to own MCP plans; set MCP_OWNER_USER_ID',
      });
    }
    return admin.id;
  }
}
