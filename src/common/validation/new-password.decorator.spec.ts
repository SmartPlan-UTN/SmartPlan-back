import { validate } from 'class-validator';
import { RegisterUserDto } from '../../auth/dto/register-user.dto';
import { ResetPasswordDto } from '../../auth/dto/reset-password.dto';
import { ChangePasswordDto } from '../../users/dto/change-password.dto';
import {
  MAX_PASSWORD_LENGTH,
  PASSWORD_DIGIT_MESSAGE,
  PASSWORD_MAX_LENGTH_MESSAGE,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_SYMBOL_MESSAGE,
  PASSWORD_UPPERCASE_MESSAGE,
} from './new-password.decorator';

type PasswordDto = RegisterUserDto | ResetPasswordDto | ChangePasswordDto;

interface DtoCase {
  name: string;
  field: 'password' | 'newPassword';
  create: (password: string) => PasswordDto;
}

const dtoCases: DtoCase[] = [
  {
    name: 'RegisterUserDto.password',
    field: 'password',
    create: (password) =>
      Object.assign(new RegisterUserDto(), {
        name: 'Ana',
        lastName: 'Pérez',
        email: 'ana@example.com',
        password,
      }),
  },
  {
    name: 'ResetPasswordDto.newPassword',
    field: 'newPassword',
    create: (newPassword) =>
      Object.assign(new ResetPasswordDto(), {
        token: 'a'.repeat(32),
        newPassword,
      }),
  },
  {
    name: 'ChangePasswordDto.newPassword',
    field: 'newPassword',
    create: (newPassword) =>
      Object.assign(new ChangePasswordDto(), {
        currentPassword: 'legacy-password',
        newPassword,
      }),
  },
];

describe.each(dtoCases)('$name common password policy', ({ field, create }) => {
  it('accepts a valid password', async () => {
    const errors = await validate(create('Abcdef1!'));

    expect(errors.find((error) => error.property === field)).toBeUndefined();
  });

  it.each([
    ['Ab1!', PASSWORD_MIN_LENGTH_MESSAGE],
    [`A1!${'a'.repeat(MAX_PASSWORD_LENGTH - 2)}`, PASSWORD_MAX_LENGTH_MESSAGE],
    ['abcdef1!', PASSWORD_UPPERCASE_MESSAGE],
    ['Abcdefgh!', PASSWORD_DIGIT_MESSAGE],
    ['Abcdefg1', PASSWORD_SYMBOL_MESSAGE],
  ])('rejects %s with a specific message', async (password, message) => {
    const errors = await validate(create(password));
    const passwordError = errors.find((error) => error.property === field);

    expect(Object.values(passwordError?.constraints ?? {})).toContain(message);
  });
});

describe('ChangePasswordDto.currentPassword', () => {
  it('does not apply the new complexity rules to an existing credential', async () => {
    const dto = Object.assign(new ChangePasswordDto(), {
      currentPassword: 'legacy-password',
      newPassword: 'Abcdef1!',
    });

    const errors = await validate(dto);

    expect(
      errors.find((error) => error.property === 'currentPassword'),
    ).toBeUndefined();
  });
});
