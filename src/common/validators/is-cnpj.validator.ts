/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-wrapper-object-types */
import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { cnpj } from 'cpf-cnpj-validator';

@ValidatorConstraint({ async: false })
export class IsCNPJConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (!value) return false;
    // O validator já sabe lidar com formatação, mas por segurança garantimos string
    return cnpj.isValid(value);
  }

  defaultMessage() {
    return 'CNPJ inválido (dígito verificador incorreto).';
  }
}

export function IsCNPJ(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCNPJConstraint,
    });
  };
}