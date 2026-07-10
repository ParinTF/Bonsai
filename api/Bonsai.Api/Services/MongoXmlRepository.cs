using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Bonsai.Api.Services;

/// <summary>
/// Persists the ASP.NET Data Protection key ring in MongoDB so encrypted
/// BYOK API keys survive container rebuilds and multi-instance deploys.
/// </summary>
public class MongoXmlRepository(IMongoDatabase database) : IXmlRepository
{
    private readonly IMongoCollection<BsonDocument> _keys =
        database.GetCollection<BsonDocument>("dataProtectionKeys");

    public IReadOnlyCollection<XElement> GetAllElements() =>
        _keys.Find(FilterDefinition<BsonDocument>.Empty)
            .ToList()
            .Select(d => XElement.Parse(d["xml"].AsString))
            .ToList();

    public void StoreElement(XElement element, string friendlyName) =>
        _keys.InsertOne(new BsonDocument
        {
            ["name"] = friendlyName ?? "",
            ["xml"] = element.ToString(SaveOptions.DisableFormatting),
            ["createdAt"] = DateTime.UtcNow,
        });
}
