import type {
  FieldToCreate,
  TwentyFieldMetadata,
  TwentyObjectName,
  TwentyOption,
} from 'src/sync/fields/schema-plan';
import type { GraphqlRequest } from 'src/twenty/gateway';

// Reads and extends the data model through Twenty's metadata API. Fields made
// here belong to the workspace, not to the app: reinstalling or upgrading the
// app leaves them, and their data, in place.

export type TwentyObjectMetadata = {
  id: string;
  fields: TwentyFieldMetadata[];
};

export type TwentyMetadataApi = {
  listObjects: (
    names: TwentyObjectName[],
  ) => Promise<Partial<Record<TwentyObjectName, TwentyObjectMetadata>>>;
  createField: (
    objectMetadataId: string,
    field: FieldToCreate,
  ) => Promise<TwentyFieldMetadata>;
  updateFieldOptions: (
    fieldId: string,
    options: TwentyOption[],
  ) => Promise<void>;
};

export class TwentyMetadataGateway implements TwentyMetadataApi {
  constructor(private readonly request: GraphqlRequest) {}

  async listObjects(
    names: TwentyObjectName[],
  ): Promise<Partial<Record<TwentyObjectName, TwentyObjectMetadata>>> {
    const data = await this.request(
      `query Objects {
        objects(paging: { first: 500 }, filter: {}) {
          edges { node { id nameSingular fieldsList { id name label type options isActive } } }
        }
      }`,
    );
    const result: Partial<Record<TwentyObjectName, TwentyObjectMetadata>> =
      {};

    for (const edge of data?.objects?.edges ?? []) {
      const node = edge.node;

      if (names.includes(node.nameSingular)) {
        result[node.nameSingular as TwentyObjectName] = {
          id: node.id,
          fields: (node.fieldsList ?? []).map(
            (field: TwentyFieldMetadata) => ({
              id: field.id,
              name: field.name,
              label: field.label,
              type: field.type,
              options: field.options ?? null,
              isActive: field.isActive ?? true,
            }),
          ),
        };
      }
    }

    return result;
  }

  async createField(
    objectMetadataId: string,
    field: FieldToCreate,
  ): Promise<TwentyFieldMetadata> {
    const data = await this.request(
      `mutation CreateField($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) { id name label type options }
      }`,
      {
        input: {
          field: {
            objectMetadataId,
            name: field.name,
            label: field.label,
            type: field.type,
            description: field.description,
            icon: field.icon,
            isNullable: true,
            ...(field.options ? { options: field.options } : {}),
            ...(field.settings ? { settings: field.settings } : {}),
          },
        },
      },
    );

    return data.createOneField as TwentyFieldMetadata;
  }

  async updateFieldOptions(
    fieldId: string,
    options: TwentyOption[],
  ): Promise<void> {
    await this.request(
      `mutation UpdateField($input: UpdateOneFieldMetadataInput!) {
        updateOneField(input: $input) { id }
      }`,
      { input: { id: fieldId, update: { options } } },
    );
  }
}
