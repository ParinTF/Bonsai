using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Bonsai.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace Bonsai.Api.Services;

public class TokenService(IConfiguration config)
{
    public string CreateToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key not configured (use user-secrets)")));

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"] ?? "bonsai",
            audience: config["Jwt:Audience"] ?? "bonsai",
            claims:
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Email, user.Email),
            ],
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
